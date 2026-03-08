import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuFolderOpen } from "react-icons/lu";
import { useConfig, useMappings, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { useDofusEvent } from "../useDofusEvent";
import { buildProgressPatch } from "./guides/progressUtils";
import { GuideList } from "./guides/GuideList";
import { GuideViewer } from "./guides/GuideViewer";
import type { GuideEntry, GuideFile, GuideProgress } from "./guides/types";

// Extract questids from quest-blocks with status="end" in a step's HTML
function extractEndQuestIds(html: string): number[] {
    const tagRe = /<div[^>]*data-type="quest-block"[^>]*>/g;
    const ids: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.includes('status="end"')) continue;
        const idMatch = /questid="(\d+)"/.exec(tag);
        if (idMatch) ids.push(parseInt(idMatch[1], 10));
    }
    return ids;
}

const BG = "rgba(10, 12, 18, 0.92)";

type View = "empty" | "list" | { kind: "viewer"; guide: GuideFile; entry: GuideEntry; initialStep?: number };

export function GuidesPanel() {
    const config = useConfig();
    const mappings = useMappings();
    const updateConfig = useUpdateConfigMutation();

    // questId (from guide HTML) → [{guideId, stepIndex}]
    const questIndexRef = useRef<Map<number, Array<{ guideId: number; stepIndex: number }>>>(new Map());

    const [view, setView] = useState<View>("empty");
    const [entries, setEntries] = useState<GuideEntry[]>([]);
    const [loading, setLoading] = useState(false);

    // Unified progress state — sourced from either conf.json or internal configStore
    const [progresses, setProgresses] = useState<GuideProgress[]>([]);
    const [confJsonPath, setConfJsonPath] = useState<string | null>(null);
    const [profileName, setProfileName] = useState<string | null>(null);

    const hasLoaded = useRef(false);

    // TODO: fill in once the quest-finished packet format is confirmed
    const questFinishedPacket = mappings?.QuestFinishedMessage ?? null;
    const questIdField = mappings?.["QuestFinishedMessage.questId"] ?? null;

    useDofusEvent(questFinishedPacket, (data: any) => {
        if (!questIdField) return;
        const questId = Number(data[questIdField]);
        if (!questId) return;
        const hits = questIndexRef.current.get(questId) ?? [];
        for (const { guideId, stepIndex } of hits) {
            handleProgressChange(guideId, { currentStep: stepIndex + 1 });
        }
    });

    const buildQuestIndex = useCallback(async (loadedEntries: GuideEntry[]) => {
        const index = new Map<number, Array<{ guideId: number; stepIndex: number }>>();
        await Promise.all(
            loadedEntries.map(async (entry) => {
                const guide = await window.api.readGuideFile(entry.filePath).catch(() => null);
                if (!guide) return;
                (guide as GuideFile).steps.forEach((step, si) => {
                    for (const qid of extractEndQuestIds(step.web_text)) {
                        if (!index.has(qid)) index.set(qid, []);
                        index.get(qid)!.push({ guideId: entry.id, stepIndex: si });
                    }
                });
            }),
        );
        questIndexRef.current = index;
    }, []);

    // Convert internal configStore progress map to array
    const internalProgressesToArray = useCallback((): GuideProgress[] => {
        return Object.values(config?.guides?.progress ?? {});
    }, [config?.guides?.progress]);

    // Auto-load folder and conf.json on mount
    useEffect(() => {
        if (hasLoaded.current) return;
        const folderPath = config?.guides?.folderPath;
        const savedConfPath = config?.guides?.confJsonPath;
        if (!folderPath) return;
        hasLoaded.current = true;

        setLoading(true);

        const loadAll = async () => {
            // Load guides
            const loaded = await window.api.readGuidesFolder(folderPath).catch(() => []);
            setEntries(loaded as GuideEntry[]);
            setView("list");
            buildQuestIndex(loaded as GuideEntry[]);

            // Load conf.json if previously selected
            if (savedConfPath) {
                const confData = await window.api.readGuidesConf(savedConfPath).catch(() => null);
                if (confData) {
                    setConfJsonPath(savedConfPath);
                    setProfileName(confData.profileName);
                    setProgresses(confData.progresses as GuideProgress[]);
                    return;
                }
            }
            // Fall back to internal progress
            setProgresses(internalProgressesToArray());
        };

        loadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config?.guides?.folderPath]);

    // Keep internal progress in sync when no conf.json is loaded
    useEffect(() => {
        if (confJsonPath) return;
        setProgresses(internalProgressesToArray());
    }, [confJsonPath, internalProgressesToArray]);

    const handlePickFolder = useCallback(async () => {
        const folderPath = await window.api.pickGuidesFolder();
        if (!folderPath) return;
        setLoading(true);
        try {
            const loaded = await window.api.readGuidesFolder(folderPath);
            setEntries(loaded as GuideEntry[]);
            setView("list");
            buildQuestIndex(loaded as GuideEntry[]);
            updateConfig.mutate({
                guides: {
                    ...(config?.guides ?? { progress: {} }),
                    folderPath,
                },
            });
        } finally {
            setLoading(false);
        }
    }, [config, updateConfig]);

    const handleLoadConf = useCallback(async () => {
        const filePath = await window.api.pickGuidesConfFile();
        if (!filePath) return;
        const confData = await window.api.readGuidesConf(filePath);
        if (!confData) return;
        setConfJsonPath(filePath);
        setProfileName(confData.profileName);
        setProgresses(confData.progresses as GuideProgress[]);
        // Persist the conf.json path
        updateConfig.mutate({
            guides: {
                ...(config?.guides ?? { progress: {} }),
                confJsonPath: filePath,
            },
        });
    }, [config, updateConfig]);

    const handleProgressChange = useCallback(
        async (guideId: number, patch: Partial<GuideProgress>) => {
            const existing = progresses.find((p) => p.id === guideId) ?? {
                id: guideId,
                currentStep: 0,
                steps: {},
                updatedAt: new Date().toISOString(),
            };
            const updated: GuideProgress = {
                ...existing,
                ...patch,
                updatedAt: new Date().toISOString(),
            };
            const newProgresses = progresses.some((p) => p.id === guideId)
                ? progresses.map((p) => (p.id === guideId ? updated : p))
                : [...progresses, updated];

            setProgresses(newProgresses);

            if (confJsonPath) {
                await window.api.writeGuidesConf(confJsonPath, newProgresses);
            } else {
                updateConfig.mutate(buildProgressPatch(config!, guideId, patch));
            }
        },
        [progresses, confJsonPath, config, updateConfig],
    );

    const handleSelectGuide = useCallback(async (entry: GuideEntry) => {
        const guide = await window.api.readGuideFile(entry.filePath);
        if (!guide) return;
        setView({ kind: "viewer", guide: guide as GuideFile, entry });
    }, []);

    const handleNavigateToGuide = useCallback(async (guideId: number, _stepIndex: number) => {
        const entry = entries.find((e) => e.id === guideId);
        if (!entry) return;
        const guide = await window.api.readGuideFile(entry.filePath);
        if (!guide) return;
        const existingProgress = progresses.find((p) => p.id === guideId);
        setView({ kind: "viewer", guide: guide as GuideFile, entry, initialStep: existingProgress?.currentStep ?? 0 });
    }, [entries, progresses]);

    const handleBack = useCallback(() => {
        setView("list");
    }, []);

    if (loading) {
        return (
            <Box w="100%" h="100%" bg={BG} display="flex" alignItems="center" justifyContent="center">
                <Text fontSize="sm" color="whiteAlpha.500">
                    Chargement...
                </Text>
            </Box>
        );
    }

    if (view === "empty") {
        return (
            <Box w="100%" h="100%" bg={BG} display="flex" alignItems="center" justifyContent="center">
                <VStack gap={4}>
                    <LuFolderOpen size={36} color="rgba(255,255,255,0.15)" />
                    <Text fontSize="sm" color="whiteAlpha.500">
                        Sélectionnez un dossier de guides
                    </Text>
                    <HStack gap={3}>
                        <Box
                            as="button"
                            display="flex"
                            alignItems="center"
                            gap={2}
                            px={4}
                            py={2}
                            borderRadius="md"
                            border="1px solid rgba(255,255,255,0.15)"
                            color="whiteAlpha.800"
                            bg="transparent"
                            fontSize="sm"
                            cursor="pointer"
                            _hover={{ bg: "rgba(255,255,255,0.06)", color: "white" }}
                            onClick={handlePickFolder}
                        >
                            <LuFolderOpen size={14} />
                            Ouvrir un dossier
                        </Box>
                    </HStack>
                </VStack>
            </Box>
        );
    }

    if (view === "list") {
        return (
            <GuideList
                entries={entries}
                progresses={progresses}
                profileName={profileName}
                folderPath={config?.guides?.folderPath ?? null}
                onSelectGuide={handleSelectGuide}
                onChangeFolder={handlePickFolder}
                onLoadConf={handleLoadConf}
                onEntriesChange={async () => {
                    const folderPath = config?.guides?.folderPath;
                    if (!folderPath) return;
                    const loaded = await window.api.readGuidesFolder(folderPath).catch(() => []);
                    setEntries(loaded as GuideEntry[]);
                }}
            />
        );
    }

    const currentProgress = progresses.find((p) => p.id === view.guide.id) ?? {
        id: view.guide.id,
        currentStep: 0,
        steps: {},
        updatedAt: new Date().toISOString(),
    };

    return (
        <GuideViewer
            key={view.guide.id}
            guide={view.guide}
            entry={view.entry}
            progress={currentProgress}
            initialStep={view.initialStep}
            onProgressChange={(patch) => handleProgressChange(view.guide.id, patch)}
            onBack={handleBack}
            onNavigateToGuide={handleNavigateToGuide}
        />
    );
}
