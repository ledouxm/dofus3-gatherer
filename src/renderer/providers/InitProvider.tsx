import { useEffect, useRef, useState, type ReactNode } from "react";
import { trpc } from "../trpc";
import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import { db } from "../db";
import { translationStore } from "./store";

type InitStepStatus = "pending" | "running" | "done" | "error";
type InitStep = { id: string; label: string; status: InitStepStatus; progress?: number };


const TRANSLATIONS_STEP: InitStep = {
    id: "translations",
    label: "Loading translations",
    status: "pending",
};

export function InitProvider({ children }: { children: ReactNode }) {
    const [mainSteps, setMainSteps] = useState<InitStep[]>([]);
    const [translationsStep, setTranslationsStep] = useState<InitStep>(TRANSLATIONS_STEP);
    const [ready, setReady] = useState(false);
    const translationsStartedRef = useRef(false);

    const steps = [...mainSteps, translationsStep];

    // Start loading translations once the sqlite step is done
    useEffect(() => {
        const sqliteDone = mainSteps.find((s) => s.id === "sqlite")?.status === "done";
        if (!sqliteDone || translationsStartedRef.current) return;
        translationsStartedRef.current = true;
        setTranslationsStep((s) => ({ ...s, status: "running" }));

        db.selectFrom("translations")
            .where("lang", "=", "fr")
            .selectAll()
            .execute()
            .then((rows) => {
                const dict = rows.reduce(
                    (acc, t) => { acc[t.id!] = t.value!; return acc; },
                    {} as Record<string, string>,
                );
                translationStore.set((v) => ({ ...v, translations: dict }));
                setTranslationsStep((s) => ({ ...s, status: "done" }));
                setReady(true);
            })
            .catch(() => {
                setTranslationsStep((s) => ({ ...s, status: "error" }));
                setReady(true);
            });
    }, [mainSteps]);

    trpc.initStatus.get.useQuery(undefined, {
        onSuccess: (initial) => setMainSteps(initial as InitStep[]),
    });

    trpc.initStatus.onChange.useSubscription(undefined, {
        onData: (updated) => setMainSteps(updated as InitStep[]),
    });

    if (ready) return <>{children}</>;

    return (
        <Flex
            position="fixed"
            inset={0}
            bg="gray.950"
            align="center"
            justify="center"
            zIndex={9999}
        >
            <VStack gap={8} align="stretch" minW="320px" maxW="480px" w="full" px={6}>
                <Text fontSize="xl" fontWeight="semibold" color="gray.100" textAlign="center">
                    Dofus Gatherer
                </Text>

                <VStack gap={5} align="stretch">
                    {steps.map((step) => (
                        <StepRow key={step.id} step={step} />
                    ))}
                </VStack>
            </VStack>
        </Flex>
    );
}

function StepRow({ step }: { step: InitStep }) {
    const isRunning = step.status === "running";
    const isDone = step.status === "done";
    const isError = step.status === "error";

    const hasProgress = isRunning && step.progress !== undefined;
    const progressPct = hasProgress ? Math.round((step.progress ?? 0) * 100) : 0;

    return (
        <VStack gap={2} align="stretch">
            <Flex justify="space-between" align="center">
                <Text fontSize="sm" color={isError ? "red.400" : isDone ? "green.400" : "gray.200"}>
                    {step.label}
                </Text>
                <Text fontSize="xs" color="gray.500">
                    {isDone ? "Done" : isError ? "Error" : hasProgress ? `${progressPct}%` : ""}
                </Text>
            </Flex>

            <Box h="4px" bg="gray.800" borderRadius="full" overflow="hidden">
                {isDone ? (
                    <Box h="full" w="full" bg="green.500" borderRadius="full" />
                ) : isError ? (
                    <Box h="full" w="full" bg="red.500" borderRadius="full" />
                ) : hasProgress ? (
                    <Box
                        h="full"
                        bg="blue.400"
                        borderRadius="full"
                        style={{ width: `${progressPct}%`, transition: "width 0.2s ease" }}
                    />
                ) : (
                    <IndeterminateBar />
                )}
            </Box>
        </VStack>
    );
}

function IndeterminateBar() {
    return (
        <>
            <style>{`
                @keyframes indeterminate {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
            `}</style>
            <Box
                h="full"
                w="1/4"
                bg="blue.400"
                borderRadius="full"
                style={{ animation: "indeterminate 1.4s ease infinite" }}
            />
        </>
    );
}
