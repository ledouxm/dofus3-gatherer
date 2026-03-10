import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuCheck, LuSearch, LuScanSearch } from "react-icons/lu";
import { useMappings, useUpdateConfigMutation } from "../providers/ConfigProvider";
import type { ConfigStore } from "../providers/store";
import type { Recording } from "./usePacketRecorder";
import { MAPPING_TARGETS, type MappingTarget } from "./mappingTargets";

type CandidateEntry = {
    typeName: string;
    sampleData: Record<string, unknown>;
    count: number;
};

type AnalysisResult = {
    candidates: CandidateEntry[];
    /** Auto-selected typeName when there is exactly one candidate */
    autoSelected: string | null;
};

function analyzeRecording(recording: Recording): Record<string, AnalysisResult> {
    // Group packets by typeName
    const groups: Record<string, { data: Record<string, unknown>; count: number }[]> = {};
    for (const entry of recording.packets) {
        if (!groups[entry.typeName]) groups[entry.typeName] = [];
        groups[entry.typeName].push({ data: entry.data, count: 1 });
    }

    // Collapse into counts + first sample per typeName
    const byType: Record<string, { sampleData: Record<string, unknown>; count: number }> = {};
    for (const [typeName, entries] of Object.entries(groups)) {
        byType[typeName] = { sampleData: entries[0].data, count: entries.length };
    }

    const results: Record<string, AnalysisResult> = {};

    for (const target of MAPPING_TARGETS) {
        const candidates: CandidateEntry[] = [];

        for (const [typeName, { sampleData, count }] of Object.entries(byType)) {
            if (!matchesSchema(sampleData, target)) continue;
            candidates.push({ typeName, sampleData, count });
        }

        // Sort by occurrence count descending (most frequent = most likely)
        candidates.sort((a, b) => b.count - a.count);

        results[target.id] = {
            candidates,
            autoSelected: candidates.length === 1 ? candidates[0].typeName : null,
        };
    }

    return results;
}

/** Check if a packet's data matches the target's expected field schema */
function matchesSchema(data: Record<string, unknown>, target: MappingTarget): boolean {
    const keys = Object.keys(data).filter((k) => k !== "_raw");
    if (keys.length !== target.fields.length) return false;
    return target.fields.every((field, i) => typeof data[keys[i]] === field.type);
}

export const MappingAssistant = ({ recording }: { recording: Recording | null }) => {
    const mappings = useMappings();
    const updateConfig = useUpdateConfigMutation();

    const [results, setResults] = useState<Record<string, AnalysisResult> | null>(null);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [applied, setApplied] = useState<Record<string, boolean>>({});

    const handleAnalyze = () => {
        if (!recording) return;
        const res = analyzeRecording(recording);
        setResults(res);
        // Pre-fill auto-selections
        const autoSel: Record<string, string> = {};
        for (const [id, result] of Object.entries(res)) {
            if (result.autoSelected) autoSel[id] = result.autoSelected;
        }
        setSelections(autoSel);
        setApplied({});
    };

    const applyMapping = async (target: MappingTarget, typeName: string) => {
        const result = results?.[target.id];
        if (!result) return;
        const candidate = result.candidates.find((c) => c.typeName === typeName);
        if (!candidate) return;

        const dataKeys = Object.keys(candidate.sampleData).filter((k) => k !== "_raw");
        const patch: Record<string, string | null> = {
            [target.id]: typeName,
        };
        target.fields.forEach((field, i) => {
            patch[`${target.id}.${field.configKey}`] = dataKeys[i] ?? null;
        });

        await updateConfig.mutateAsync({ mappings: { ...mappings, ...patch } as ConfigStore["mappings"] });
        setApplied((prev) => ({ ...prev, [target.id]: true }));
    };

    const applyAll = async () => {
        if (!results) return;
        for (const target of MAPPING_TARGETS) {
            const sel = selections[target.id];
            if (sel) await applyMapping(target, sel);
        }
    };

    const anySelectable = MAPPING_TARGETS.some((t) => !!selections[t.id]);

    return (
        <Flex direction="column" h="100%" overflow="hidden">
            {/* Header */}
            <Flex
                align="center"
                gap={2}
                px={3}
                py="6px"
                borderBottom="1px solid"
                borderColor="whiteAlpha.100"
                bg="whiteAlpha.50"
                flexShrink={0}
            >
                <LuScanSearch size={13} color="var(--chakra-colors-purple-400)" />
                <Text fontSize="xs" fontWeight="semibold" color="whiteAlpha.800">
                    Mapping Assistant
                </Text>
            </Flex>

            {/* Body */}
            <Box flex={1} overflowY="auto" p={3} css={{ "&::-webkit-scrollbar": { width: "4px" }, "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "2px" } }}>
                {!recording ? (
                    <Flex h="100%" align="center" justify="center" minH="80px">
                        <Text fontSize="xs" color="whiteAlpha.400">Load a recording first</Text>
                    </Flex>
                ) : (
                    <Stack gap={3}>
                        <Button
                            size="sm"
                            onClick={handleAnalyze}
                            gap={2}
                            bg="rgba(159,122,234,0.12)"
                            color="purple.300"
                            border="1px solid rgba(159,122,234,0.3)"
                            borderRadius="md"
                            _hover={{ bg: "rgba(159,122,234,0.2)" }}
                        >
                            <LuSearch size={13} />
                            Analyze recording
                        </Button>

                        {results && (
                            <>
                                {MAPPING_TARGETS.map((target) => (
                                    <TargetCard
                                        key={target.id}
                                        target={target}
                                        result={results[target.id]}
                                        selected={selections[target.id] ?? null}
                                        isApplied={!!applied[target.id]}
                                        currentValue={(mappings as Record<string, string | null>)?.[target.id] ?? null}
                                        onSelect={(tn) => setSelections((s) => ({ ...s, [target.id]: tn }))}
                                        onApply={(tn) => applyMapping(target, tn)}
                                        isPending={updateConfig.isPending}
                                    />
                                ))}

                                {anySelectable && (
                                    <Button
                                        size="xs"
                                        onClick={applyAll}
                                        loading={updateConfig.isPending}
                                        gap={2}
                                        alignSelf="flex-end"
                                        bg="rgba(72,187,120,0.10)"
                                        color="green.300"
                                        border="1px solid rgba(72,187,120,0.3)"
                                        borderRadius="md"
                                        _hover={{ bg: "rgba(72,187,120,0.18)" }}
                                    >
                                        <LuCheck size={11} />
                                        Apply all selected
                                    </Button>
                                )}
                            </>
                        )}
                    </Stack>
                )}
            </Box>
        </Flex>
    );
};

// ── Target card ────────────────────────────────────────────────────────────────

type TargetCardProps = {
    target: MappingTarget;
    result: AnalysisResult;
    selected: string | null;
    isApplied: boolean;
    currentValue: string | null | undefined;
    onSelect: (typeName: string) => void;
    onApply: (typeName: string) => void;
    isPending: boolean;
};

const TargetCard = ({
    target,
    result,
    selected,
    isApplied,
    currentValue,
    onSelect,
    onApply,
    isPending,
}: TargetCardProps) => {
    const hasCandidates = result.candidates.length > 0;

    return (
        <Box
            borderRadius="md"
            border="1px solid"
            borderColor={isApplied ? "green.700" : hasCandidates ? "whiteAlpha.150" : "whiteAlpha.80"}
            bg={isApplied ? "rgba(72,187,120,0.06)" : "whiteAlpha.50"}
            overflow="hidden"
        >
            {/* Header */}
            <Flex align="center" gap={2} px={3} py={2} borderBottom="1px solid" borderColor="whiteAlpha.80" wrap="wrap">
                <Text fontSize="xs" fontWeight="bold" color="whiteAlpha.900" fontFamily="mono">
                    {target.id}
                </Text>
                {currentValue && (
                    <Badge fontSize="9px" colorPalette="blue" fontFamily="mono">{currentValue}</Badge>
                )}
                {isApplied && (
                    <Badge fontSize="9px" colorPalette="green">saved</Badge>
                )}
                <Text fontSize="10px" color="whiteAlpha.400" ml="auto">
                    {target.action}
                </Text>
            </Flex>

            {/* Candidates list */}
            {!hasCandidates ? (
                <Box px={3} py={2}>
                    <Text fontSize="10px" color="orange.400">No candidates found in this recording</Text>
                </Box>
            ) : (
                <Stack gap={0}>
                    {result.candidates.map((c, idx) => {
                        const isSelected = selected === c.typeName;
                        const dataKeys = Object.keys(c.sampleData).filter((k) => k !== "_raw");
                        const isTop = idx === 0;

                        return (
                            <Box
                                key={c.typeName}
                                borderTop={idx > 0 ? "1px solid" : undefined}
                                borderColor="whiteAlpha.70"
                                bg={isSelected ? "rgba(159,122,234,0.10)" : "transparent"}
                                transition="background 0.1s"
                            >
                                {/* Candidate row */}
                                <Flex
                                    as="button"
                                    w="100%"
                                    align="center"
                                    gap={2}
                                    px={3}
                                    py="6px"
                                    onClick={() => onSelect(c.typeName)}
                                    _hover={{ bg: isSelected ? "rgba(159,122,234,0.15)" : "rgba(255,255,255,0.04)" }}
                                    textAlign="left"
                                >
                                    {/* Radio indicator */}
                                    <Box
                                        flexShrink={0}
                                        w="12px"
                                        h="12px"
                                        borderRadius="full"
                                        border="2px solid"
                                        borderColor={isSelected ? "purple.400" : "whiteAlpha.300"}
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                    >
                                        {isSelected && (
                                            <Box w="5px" h="5px" borderRadius="full" bg="purple.400" />
                                        )}
                                    </Box>

                                    {/* Type name */}
                                    <Text
                                        fontFamily="mono"
                                        fontSize="11px"
                                        fontWeight={isSelected ? "bold" : "normal"}
                                        color={isSelected ? "purple.200" : "whiteAlpha.700"}
                                        flex={1}
                                    >
                                        {c.typeName}
                                    </Text>

                                    {/* Count badge */}
                                    <Badge
                                        fontSize="9px"
                                        colorPalette={isTop ? "purple" : "gray"}
                                        variant="subtle"
                                        flexShrink={0}
                                    >
                                        ×{c.count}
                                    </Badge>

                                    {/* Apply button (only shown when selected) */}
                                    {isSelected && (
                                        <Button
                                            size="xs"
                                            loading={isPending}
                                            disabled={isApplied}
                                            onClick={(e) => { e.stopPropagation(); onApply(c.typeName); }}
                                            gap={1}
                                            bg={isApplied ? "rgba(72,187,120,0.12)" : "rgba(159,122,234,0.2)"}
                                            color={isApplied ? "green.300" : "purple.200"}
                                            border={`1px solid ${isApplied ? "rgba(72,187,120,0.4)" : "rgba(159,122,234,0.5)"}`}
                                            borderRadius="sm"
                                            _hover={{ bg: isApplied ? "rgba(72,187,120,0.2)" : "rgba(159,122,234,0.3)" }}
                                            _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
                                            flexShrink={0}
                                        >
                                            {isApplied ? <LuCheck size={9} /> : null}
                                            {isApplied ? "Applied" : "Apply"}
                                        </Button>
                                    )}
                                </Flex>

                                {/* Field preview (only for selected) */}
                                {isSelected && (
                                    <Box px={3} pb="6px">
                                        <Flex gap={3} wrap="wrap">
                                            {target.fields.map((field, i) => {
                                                const obfKey = dataKeys[i];
                                                const sampleVal = obfKey ? c.sampleData[obfKey] : undefined;
                                                return (
                                                    <Flex key={field.configKey} align="center" gap={1}>
                                                        <Text fontFamily="mono" fontSize="9px" color="whiteAlpha.600">
                                                            {obfKey ?? "?"}
                                                        </Text>
                                                        {sampleVal !== undefined && (
                                                            <Text fontFamily="mono" fontSize="9px" color="whiteAlpha.350">
                                                                ={String(sampleVal)}
                                                            </Text>
                                                        )}
                                                        <Text fontSize="9px" color="whiteAlpha.300">→</Text>
                                                        <Text fontFamily="mono" fontSize="9px" color="blue.400">
                                                            .{field.configKey}
                                                        </Text>
                                                    </Flex>
                                                );
                                            })}
                                        </Flex>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            )}
        </Box>
    );
};

