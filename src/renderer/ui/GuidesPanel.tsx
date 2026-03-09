import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuFolderOpen, LuX } from "react-icons/lu";
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
const BORDER = "1px solid rgba(255,255,255,0.08)";
const ACCENT = "#d4f000";

type OpenedTab = { guideId: number; guide: GuideFile; entry: GuideEntry };

function deriveGuidesPath(ganymedePath: string): string {
    return ganymedePath.replace(/[\\/]$/, "") + "/guides";
}

function deriveConfPath(ganymedePath: string): string {
    return ganymedePath.replace(/[\\/]$/, "") + "/conf.json";
}

function GuideTabItem({
    label,
    isActive,
    isSpecial,
    progressPct,
    onClose,
    onClick,
}: {
    label: string;
    isActive: boolean;
    isSpecial?: boolean;
    progressPct?: number;
    onClose?: () => void;
    onClick: () => void;
}) {
    return (
        <Box
            position="relative"
            display="flex"
            alignItems="center"
            gap={1}
            px={isSpecial ? 3 : 2}
            py="6px"
            cursor="pointer"
            flexShrink={0}
            maxW="160px"
            borderRight={BORDER}
            bg={isActive ? "rgba(255,255,255,0.06)" : "transparent"}
            _hover={{ bg: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)" }}
            onClick={onClick}
            title={label}
        >
            <Text
                fontSize="xs"
                color={isActive ? "white" : "whiteAlpha.600"}
                fontWeight={isActive ? "600" : "400"}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                flex={1}
                minW={0}
            >
                {label}
            </Text>
            {onClose && (
                <Box
                    as="button"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    w="14px"
                    h="14px"
                    borderRadius="2px"
                    flexShrink={0}
                    color="whiteAlpha.400"
                    _hover={{ color: "whiteAlpha.900", bg: "rgba(255,255,255,0.1)" }}
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onClose();
                    }}
                >
                    <LuX size={10} />
                </Box>
            )}
            {/* Active indicator / progress bar */}
            {isActive && progressPct === undefined && (
                <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    h="2px"
                    bg={ACCENT}
                />
            )}
            {progressPct !== undefined && (
                <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    h="2px"
                    bg="rgba(255,255,255,0.08)"
                >
                    <Box
                        h="100%"
                        w={`${progressPct}%`}
                        bg={isActive ? ACCENT : "rgba(212,240,0,0.4)"}
                        transition="width 0.2s"
                    />
                </Box>
            )}
        </Box>
    );
}

export function GuidesPanel() {
    const config = useConfig();
    const mappings = useMappings();
    const updateConfig = useUpdateConfigMutation();

    // questId (from guide HTML) → [{guideId, stepIndex}]
    const questIndexRef = useRef<Map<number, Array<{ guideId: number; stepIndex: number }>>>(new Map());

    // Tabs state
    const [openedTabs, setOpenedTabs] = useState<OpenedTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<number | null>(null); // null = list view

    const [entries, setEntries] = useState<GuideEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasFolder, setHasFolder] = useState(false);

    // Unified progress state — sourced from either conf.json or internal configStore
    const [progresses, setProgresses] = useState<GuideProgress[]>([]);
    const [profileName, setProfileName] = useState<string | null>(null);

    // Resolved ganymedePath (may come from config or auto-detection)
    const [ganymedePath, setGanymedePath] = useState<string | null>(null);

    const hasLoaded = useRef(false);

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

    // Save tab state to config
    const saveTabsToConfig = useCallback(
        (tabs: OpenedTab[], activeId: number | null) => {
            updateConfig.mutate({
                guides: {
                    ...(config?.guides ?? { progress: {} }),
                    openedTabIds: tabs.map((t) => t.guideId),
                    activeTabId: activeId,
                },
            });
        },
        [config, updateConfig],
    );

    const loadFromGanymedePath = useCallback(
        async (ganymPath: string) => {
            const guidesPath = deriveGuidesPath(ganymPath);
            const confPath = deriveConfPath(ganymPath);

            const loaded = await window.api.readGuidesFolder(guidesPath).catch(() => []);
            setEntries(loaded as GuideEntry[]);
            setHasFolder(true);
            buildQuestIndex(loaded as GuideEntry[]);

            const confData = await window.api.readGuidesConf(confPath).catch(() => null);
            if (confData) {
                setProfileName(confData.profileName);
                setProgresses(confData.progresses as GuideProgress[]);
            } else {
                setProfileName(null);
                setProgresses(internalProgressesToArray());
            }

            // Restore open tabs from config
            const savedTabIds: number[] = config?.guides?.openedTabIds ?? [];
            const savedActiveId: number | null = config?.guides?.activeTabId ?? null;
            if (savedTabIds.length > 0) {
                const restoredTabs: OpenedTab[] = [];
                await Promise.all(
                    savedTabIds.map(async (id) => {
                        const entry = (loaded as GuideEntry[]).find((e) => e.id === id);
                        if (!entry) return;
                        const guide = await window.api.readGuideFile(entry.filePath).catch(() => null);
                        if (guide) restoredTabs.push({ guideId: id, guide: guide as GuideFile, entry });
                    }),
                );
                // Preserve original order
                const ordered = savedTabIds
                    .map((id) => restoredTabs.find((t) => t.guideId === id))
                    .filter((t): t is OpenedTab => !!t);
                setOpenedTabs(ordered);
                const restoredActiveId =
                    savedActiveId !== null && ordered.some((t) => t.guideId === savedActiveId)
                        ? savedActiveId
                        : null;
                setActiveTabId(restoredActiveId);
            }
        },
        [buildQuestIndex, internalProgressesToArray, config?.guides?.openedTabIds, config?.guides?.activeTabId],
    );

    // Auto-load on mount
    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;

        const savedPath = config?.guides?.ganymedePath;

        const init = async () => {
            setLoading(true);
            try {
                if (savedPath) {
                    setGanymedePath(savedPath);
                    await loadFromGanymedePath(savedPath);
                } else {
                    // Try auto-detection
                    const detected = await window.api.getDefaultGanymedePath().catch(() => null);
                    if (detected) {
                        setGanymedePath(detected);
                        updateConfig.mutate({
                            guides: {
                                ...(config?.guides ?? { progress: {} }),
                                ganymedePath: detected,
                            },
                        });
                        await loadFromGanymedePath(detected);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep internal progress in sync when no conf.json is loaded
    useEffect(() => {
        if (profileName) return;
        setProgresses(internalProgressesToArray());
    }, [profileName, internalProgressesToArray]);

    const handlePickGanymedeFolder = useCallback(async () => {
        const picked = await window.api.pickGanymedeFolder();
        if (!picked) return;
        setLoading(true);
        try {
            setGanymedePath(picked);
            updateConfig.mutate({
                guides: {
                    ...(config?.guides ?? { progress: {} }),
                    ganymedePath: picked,
                },
            });
            await loadFromGanymedePath(picked);
        } finally {
            setLoading(false);
        }
    }, [config, updateConfig, loadFromGanymedePath]);

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

            if (ganymedePath) {
                await window.api.writeGuidesConf(deriveConfPath(ganymedePath), newProgresses);
            } else {
                updateConfig.mutate(buildProgressPatch(config!, guideId, patch));
            }
        },
        [progresses, ganymedePath, config, updateConfig],
    );

    const handleSelectGuide = useCallback(
        async (entry: GuideEntry) => {
            // If already open, just switch to it
            const existing = openedTabs.find((t) => t.guideId === entry.id);
            if (existing) {
                setActiveTabId(entry.id);
                saveTabsToConfig(openedTabs, entry.id);
                return;
            }
            const guide = await window.api.readGuideFile(entry.filePath);
            if (!guide) return;
            const newTab: OpenedTab = { guideId: entry.id, guide: guide as GuideFile, entry };
            const newTabs = [...openedTabs, newTab];
            setOpenedTabs(newTabs);
            setActiveTabId(entry.id);
            saveTabsToConfig(newTabs, entry.id);
        },
        [openedTabs, saveTabsToConfig],
    );

    const handleCloseTab = useCallback(
        (guideId: number) => {
            const idx = openedTabs.findIndex((t) => t.guideId === guideId);
            const newTabs = openedTabs.filter((t) => t.guideId !== guideId);
            let newActiveId: number | null = activeTabId;
            if (activeTabId === guideId) {
                if (newTabs.length === 0) {
                    newActiveId = null;
                } else {
                    // Switch to adjacent tab (prefer next, fallback to previous)
                    newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].guideId;
                }
            }
            setOpenedTabs(newTabs);
            setActiveTabId(newActiveId);
            saveTabsToConfig(newTabs, newActiveId);
        },
        [openedTabs, activeTabId, saveTabsToConfig],
    );

    const handleNavigateToGuide = useCallback(
        async (guideId: number, _stepIndex: number) => {
            const entry = entries.find((e) => e.id === guideId);
            if (!entry) return;
            const existing = openedTabs.find((t) => t.guideId === guideId);
            if (existing) {
                setActiveTabId(guideId);
                saveTabsToConfig(openedTabs, guideId);
                return;
            }
            const guide = await window.api.readGuideFile(entry.filePath);
            if (!guide) return;
            const existingProgress = progresses.find((p) => p.id === guideId);
            const newTab: OpenedTab = { guideId, guide: guide as GuideFile, entry };
            const newTabs = [...openedTabs, newTab];
            setOpenedTabs(newTabs);
            setActiveTabId(guideId);
            saveTabsToConfig(newTabs, guideId);
            // Set initial step via progress
            if (existingProgress) {
                handleProgressChange(guideId, { currentStep: existingProgress.currentStep });
            }
        },
        [entries, openedTabs, progresses, saveTabsToConfig, handleProgressChange],
    );

    const handleSwitchTab = useCallback(
        (guideId: number | null) => {
            setActiveTabId(guideId);
            saveTabsToConfig(openedTabs, guideId);
        },
        [openedTabs, saveTabsToConfig],
    );

    // Progress percent for tab indicator
    const getProgressPct = useCallback(
        (guideId: number, totalSteps: number) => {
            const prog = progresses.find((p) => p.id === guideId);
            if (!prog || totalSteps <= 1) return 0;
            return Math.round((prog.currentStep / (totalSteps - 1)) * 100);
        },
        [progresses],
    );

    if (loading) {
        return (
            <Box w="100%" h="100%" bg={BG} display="flex" alignItems="center" justifyContent="center">
                <Text fontSize="sm" color="whiteAlpha.500">
                    Chargement...
                </Text>
            </Box>
        );
    }

    if (!hasFolder) {
        return (
            <Box w="100%" h="100%" bg={BG} display="flex" alignItems="center" justifyContent="center">
                <VStack gap={4}>
                    <LuFolderOpen size={36} color="rgba(255,255,255,0.15)" />
                    <Text fontSize="sm" color="whiteAlpha.500">
                        Sélectionnez le dossier Ganymede
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
                            onClick={handlePickGanymedeFolder}
                        >
                            <LuFolderOpen size={14} />
                            Ouvrir le dossier Ganymede
                        </Box>
                    </HStack>
                </VStack>
            </Box>
        );
    }

    return (
        <Box w="100%" h="100%" bg={BG} display="flex" flexDirection="column" overflow="hidden">
            {/* Tab bar */}
            <HStack
                gap={0}
                borderBottom={BORDER}
                flexShrink={0}
                overflowX="auto"
                css={{
                    "&::-webkit-scrollbar": { height: "2px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "4px" },
                }}
            >
                {/* List tab */}
                <GuideTabItem
                    label="Guides"
                    isActive={activeTabId === null}
                    isSpecial
                    onClick={() => handleSwitchTab(null)}
                />
                {/* Guide tabs */}
                {openedTabs.map((tab) => (
                    <GuideTabItem
                        key={tab.guideId}
                        label={tab.guide.name}
                        isActive={activeTabId === tab.guideId}
                        progressPct={getProgressPct(tab.guideId, tab.guide.steps.length)}
                        onClose={() => handleCloseTab(tab.guideId)}
                        onClick={() => handleSwitchTab(tab.guideId)}
                    />
                ))}
            </HStack>

            {/* Content */}
            {/* List view */}
            <Box
                flex={1}
                overflow="hidden"
                display={activeTabId === null ? "flex" : "none"}
                flexDirection="column"
            >
                <GuideList
                    entries={entries}
                    progresses={progresses}
                    profileName={profileName}
                    folderPath={ganymedePath}
                    onSelectGuide={handleSelectGuide}
                    onChangeFolder={handlePickGanymedeFolder}
                    onEntriesChange={async () => {
                        if (!ganymedePath) return;
                        const loaded = await window.api
                            .readGuidesFolder(deriveGuidesPath(ganymedePath))
                            .catch(() => []);
                        setEntries(loaded as GuideEntry[]);
                    }}
                />
            </Box>

            {/* Guide tab views */}
            {openedTabs.map((tab) => {
                const currentProgress = progresses.find((p) => p.id === tab.guideId) ?? {
                    id: tab.guideId,
                    currentStep: 0,
                    steps: {},
                    updatedAt: new Date().toISOString(),
                };
                return (
                    <Box
                        key={tab.guideId}
                        flex={1}
                        overflow="hidden"
                        display={activeTabId === tab.guideId ? "flex" : "none"}
                        flexDirection="column"
                    >
                        <GuideViewer
                            guide={tab.guide}
                            entry={tab.entry}
                            progress={currentProgress}
                            onProgressChange={(patch) => handleProgressChange(tab.guideId, patch)}
                            onNavigateToGuide={handleNavigateToGuide}
                        />
                    </Box>
                );
            })}
        </Box>
    );
}
