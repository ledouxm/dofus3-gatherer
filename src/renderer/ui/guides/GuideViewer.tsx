import { Box, HStack, IconButton, Text } from "@chakra-ui/react";
import { useCallback, useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { useClipboardToast } from "../useClipboardToast";
import { GuideHtmlContent } from "./GuideHtmlContent";
import type { GuideEntry, GuideFile, GuideProgress } from "./types";

const BORDER = "1px solid rgba(255,255,255,0.08)";
const BG = "rgba(10, 12, 18, 0.92)";

function MapCoordsButton({ x, y }: { x: number; y: number }) {
    const copy = useClipboardToast();
    return (
        <Box
            as="button"
            display="inline-flex"
            alignItems="center"
            bg="transparent"
            border="none"
            p={0}
            cursor="pointer"
            onClick={() => copy(`/travel ${x} ${y}`, `[${x},${y}]`)}
        >
            <Text
                fontSize="xs"
                fontWeight="bold"
                color="whiteAlpha.500"
                _hover={{ color: "whiteAlpha.700" }}
                transition="color 0.1s"
            >
                [{x} ; {y}]
            </Text>
        </Box>
    );
}

interface Props {
    guide: GuideFile;
    entry: GuideEntry;
    progress: GuideProgress;
    onProgressChange: (patch: Partial<GuideProgress>) => void;
    onBack: () => void;
}

export function GuideViewer({ guide, entry, progress, onProgressChange, onBack }: Props) {
    const [currentStep, setCurrentStep] = useState(() =>
        Math.min(progress.currentStep, Math.max(0, guide.steps.length - 1)),
    );

    const step = guide.steps[currentStep];
    const isFirst = currentStep === 0;
    const isLast = currentStep === guide.steps.length - 1;
    const checkedBoxes = progress.steps[String(currentStep)]?.checkboxes ?? [];

    const goToStep = useCallback(
        (idx: number) => {
            const clamped = Math.max(0, Math.min(idx, guide.steps.length - 1));
            setCurrentStep(clamped);
            onProgressChange({ currentStep: clamped });
        },
        [guide.steps.length, onProgressChange],
    );

    const handleCheckboxToggle = useCallback(
        (cbIdx: number) => {
            const stepProg = progress.steps[String(currentStep)] ?? { checkboxes: [] };
            const updated = stepProg.checkboxes.includes(cbIdx)
                ? stepProg.checkboxes.filter((i) => i !== cbIdx)
                : [...stepProg.checkboxes, cbIdx];
            onProgressChange({
                steps: { ...progress.steps, [String(currentStep)]: { checkboxes: updated } },
            });
        },
        [currentStep, progress.steps, onProgressChange],
    );

    return (
        <Box w="100%" h="100%" bg={BG} display="flex" flexDirection="column" overflow="hidden">
            {/* Header */}
            <HStack px={2} py={1} borderBottom={BORDER} flexShrink={0} gap={1}>
                <IconButton
                    aria-label="Retour"
                    size="xs"
                    variant="ghost"
                    color="whiteAlpha.600"
                    _hover={{ color: "white" }}
                    onClick={onBack}
                >
                    <LuChevronLeft />
                </IconButton>
                <Text fontSize="sm" color="whiteAlpha.800" fontWeight="600" flex={1} truncate>
                    {guide.name}
                </Text>
                <Text fontSize="10px" color="whiteAlpha.500" flexShrink={0}>
                    {currentStep + 1}/{guide.steps.length}
                </Text>
            </HStack>

            {/* Step progress bar */}
            <HStack px={3} py={2} gap="2px" flexShrink={0} borderBottom={BORDER} flexWrap="wrap">
                {guide.steps.map((s, idx) => (
                    <Box
                        key={idx}
                        as="button"
                        h="4px"
                        flex={1}
                        minW="6px"
                        maxW="48px"
                        borderRadius="full"
                        bg={
                            idx < currentStep
                                ? "#d4f000"
                                : idx === currentStep
                                  ? "rgba(212,240,0,0.45)"
                                  : "rgba(255,255,255,0.1)"
                        }
                        cursor="pointer"
                        onClick={() => goToStep(idx)}
                        title={s.name ?? `Étape ${idx + 1}`}
                        _hover={{ opacity: 0.75 }}
                    />
                ))}
            </HStack>

            {/* Step header */}
            <Box px={4} pt={3} pb={1} flexShrink={0}>
                <Text fontSize="10px" color="whiteAlpha.500" fontWeight="600" letterSpacing="wider">
                    ÉTAPE {currentStep + 1}
                </Text>
                {step?.name && (
                    <Text fontSize="md" color="whiteAlpha.900" fontWeight="600" mt={0.5} lineHeight="1.3">
                        {step.name}
                    </Text>
                )}
                {step?.pos_x !== undefined &&
                    step?.pos_y !== undefined &&
                    step.map?.toLowerCase() !== "nomap" && (
                        <MapCoordsButton x={step.pos_x} y={step.pos_y} />
                    )}
            </Box>

            {/* Scrollable content */}
            <Box
                flex={1}
                overflow="auto"
                px={4}
                py={3}
                css={{
                    "&::-webkit-scrollbar": { width: "4px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": {
                        background: "rgba(255,255,255,0.15)",
                        borderRadius: "4px",
                    },
                }}
            >
                {step && (
                    <GuideHtmlContent
                        html={step.web_text}
                        checkedBoxes={checkedBoxes}
                        onCheckboxToggle={handleCheckboxToggle}
                    />
                )}
            </Box>

            {/* Navigation footer */}
            <HStack px={4} py={3} borderTop={BORDER} flexShrink={0} justify="space-between">
                <Box
                    as="button"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    px={3}
                    py={1}
                    borderRadius="md"
                    border={BORDER}
                    color={isFirst ? "whiteAlpha.400" : "whiteAlpha.700"}
                    bg="transparent"
                    cursor={isFirst ? "not-allowed" : "pointer"}
                    fontSize="sm"
                    _hover={isFirst ? {} : { color: "whiteAlpha.900", borderColor: "rgba(255,255,255,0.2)" }}
                    onClick={() => !isFirst && goToStep(currentStep - 1)}
                >
                    <LuChevronLeft size={14} />
                    Précédent
                </Box>

                <Box
                    as="button"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    px={3}
                    py={1}
                    borderRadius="md"
                    border={isLast ? "1px solid rgba(212,240,0,0.3)" : BORDER}
                    color={isLast ? "#d4f000" : "whiteAlpha.700"}
                    bg={isLast ? "rgba(212,240,0,0.08)" : "transparent"}
                    cursor={isLast ? "not-allowed" : "pointer"}
                    fontSize="sm"
                    _hover={isLast ? {} : { color: "whiteAlpha.900", borderColor: "rgba(255,255,255,0.2)" }}
                    onClick={() => !isLast && goToStep(currentStep + 1)}
                >
                    {isLast ? "Terminé ✓" : "Suivant"}
                    {!isLast && <LuChevronRight size={14} />}
                </Box>
            </HStack>
        </Box>
    );
}
