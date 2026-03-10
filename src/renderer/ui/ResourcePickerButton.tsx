import { Badge, Box, HStack, IconButton, Popover, Text, Tooltip } from "@chakra-ui/react";
import { useStoreValue } from "@simplestack/store/react";
import { LuMinus, LuPlus, LuStar, LuX } from "react-icons/lu";
import { useState } from "react";
import { mapStore } from "../providers/store";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { getItemIconUrl } from "../resources/ResourcesList";
import {
    groupResourcesByJob,
    ResourceWithJob,
    useResourcesQuery,
} from "../resources/useResourcesQuery";

const DEFAULT_RESOURCE_ID = 303;

const ITEMS_PER_ROW = 5;
const ITEM_SIZE = 38; // px
const ITEM_GAP = 4; // px
const POPOVER_PADDING = 8; // px
const SCROLLBAR_WIDTH = 15; // px
const GRID_WIDTH = ITEMS_PER_ROW * ITEM_SIZE + (ITEMS_PER_ROW - 1) * ITEM_GAP;
const POPOVER_WIDTH = GRID_WIDTH + POPOVER_PADDING * 2 + SCROLLBAR_WIDTH;

const setSelectedIds = (newIds: number[]) => {
    const highlighted = mapStore.get().highlightedResourceIds.filter((id) => newIds.includes(id));
    mapStore.set((v) => ({ ...v, selectedResourceIds: newIds, highlightedResourceIds: highlighted }));
    window.api.saveConfig({ selectedResourceIds: newIds, highlightedResourceIds: highlighted });
};

const toggleResource = (itemId: number, current: number[]) => {
    const newIds = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
    setSelectedIds(newIds);
};

const toggleJobGroup = (groupItemIds: number[], current: number[]) => {
    const allSelected = groupItemIds.every((id) => current.includes(id));
    const newIds = allSelected
        ? current.filter((id) => !groupItemIds.includes(id))
        : [...new Set([...current, ...groupItemIds])];
    setSelectedIds(newIds);
};

const toggleHighlight = (itemId: number) => {
    const current = mapStore.get().highlightedResourceIds;
    const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
    mapStore.set((v) => ({ ...v, highlightedResourceIds: next }));
    window.api.saveConfig({ highlightedResourceIds: next });
};

export const ResourcePickerButton = () => {
    const { data: resources } = useResourcesQuery();
    const selectedResourceIds = useStoreValue(mapStore, (s) => s.selectedResourceIds);
    const highlightedResourceIds = useStoreValue(mapStore, (s) => s.highlightedResourceIds);
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [showNewPreset, setShowNewPreset] = useState(false);
    const [presetName, setPresetName] = useState("");
    const [iconSearch, setIconSearch] = useState("");
    const [selectedIconItemId, setSelectedIconItemId] = useState<number | null>(null);

    if (!resources) return null;

    const jobGroups = groupResourcesByJob(resources);
    const buttonIcon = resolveButtonIcon(resources, selectedResourceIds);
    const extraCount = selectedResourceIds.length > 1 ? selectedResourceIds.length - 1 : 0;
    const presets = config.resourcePresets ?? [];

    const iconSearchResults = iconSearch.trim().length >= 2
        ? resources.filter((r) => r.itemName.toLowerCase().includes(iconSearch.toLowerCase())).slice(0, 8)
        : [];

    const isPresetActive = (resourceIds: number[]) => {
        const a = [...resourceIds].sort().join(",");
        const b = [...selectedResourceIds].sort().join(",");
        return a === b && a.length > 0;
    };

    const savePreset = () => {
        if (!presetName.trim() || !selectedIconItemId) return;
        const newPreset = {
            id: crypto.randomUUID(),
            name: presetName.trim(),
            iconItemId: selectedIconItemId,
            resourceIds: [...selectedResourceIds],
        };
        updateConfig.mutate({ resourcePresets: [...presets, newPreset] });
        setShowNewPreset(false);
        setPresetName("");
        setIconSearch("");
        setSelectedIconItemId(null);
    };

    const deletePreset = (id: string) => {
        updateConfig.mutate({ resourcePresets: presets.filter((p) => p.id !== id) });
    };

    return (
        <Popover.Root>
            <Box position="relative" display="inline-flex">
                <Popover.Trigger asChild>
                    <IconButton
                        aria-label="Select resources"
                        size="sm"
                        variant="solid"
                        borderRadius="md"
                        p={1}
                        bg="rgba(10, 12, 18, 0.85)"
                        border="1px solid rgba(255,255,255,0.1)"
                        h="36px"
                        w="36px"
                        minW="36px"
                        transition="transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease"
                        _hover={{
                            bg: "rgba(30, 35, 50, 0.95)",
                            transform: "scale(1.1)",
                            boxShadow: "0 0 10px rgba(255,255,255,0.12)",
                            borderColor: "rgba(255,255,255,0.22)",
                        }}
                    >
                        <img
                            src={buttonIcon.url}
                            alt="selected resource"
                            width={28}
                            height={28}
                            style={{ filter: buttonIcon.grayscale ? "grayscale(1)" : "none", objectFit: "contain" }}
                        />
                    </IconButton>
                </Popover.Trigger>
                {extraCount > 0 && (
                    <Badge
                        position="absolute"
                        bottom="-1"
                        right="-1"
                        borderRadius="full"
                        size="xs"
                        colorPalette="blue"
                        pointerEvents="none"
                    >
                        +{extraCount}
                    </Badge>
                )}
            </Box>
            <Popover.Positioner>
                <Popover.Content
                    w={`${POPOVER_WIDTH}px`}
                    maxH="480px"
                    overflowY="auto"
                    bg="rgba(10, 12, 18, 0.97)"
                    border="1px solid rgba(255,255,255,0.12)"
                    borderRadius="md"
                    p={`${POPOVER_PADDING}px`}
                    style={{ scrollbarGutter: "stable" }}
                >
                    {/* ── Presets ── */}
                    <Box mb={2}>
                        <HStack mb={1} gap={1} justify="space-between">
                            <Text fontSize="xs" fontWeight="semibold" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wide">
                                Presets
                            </Text>
                            {!showNewPreset && (
                                <IconButton
                                    aria-label="New preset"
                                    size="2xs"
                                    variant="ghost"
                                    color="whiteAlpha.500"
                                    _hover={{ color: "#d4f000" }}
                                    onClick={() => setShowNewPreset(true)}
                                >
                                    <LuPlus />
                                </IconButton>
                            )}
                        </HStack>

                        {presets.length > 0 && (
                            <Box display="flex" flexWrap="wrap" gap="4px" mb={1}>
                                {presets.map((preset) => {
                                    const active = isPresetActive(preset.resourceIds);
                                    return (
                                        <Box
                                            key={preset.id}
                                            as="button"
                                            display="inline-flex"
                                            alignItems="center"
                                            gap="4px"
                                            px="6px"
                                            py="3px"
                                            borderRadius="full"
                                            border={`1px solid ${active ? "rgba(212,240,0,0.6)" : "rgba(255,255,255,0.15)"}`}
                                            bg={active ? "rgba(212,240,0,0.1)" : "rgba(255,255,255,0.05)"}
                                            color={active ? "#d4f000" : "rgba(255,255,255,0.7)"}
                                            fontSize="10px"
                                            fontWeight="600"
                                            cursor="pointer"
                                            _hover={{ borderColor: active ? "rgba(212,240,0,0.8)" : "rgba(255,255,255,0.3)" }}
                                            onClick={() => setSelectedIds(preset.resourceIds)}
                                        >
                                            <img
                                                src={getItemIconUrl(preset.iconItemId)}
                                                width={14}
                                                height={14}
                                                style={{ objectFit: "contain", flexShrink: 0 }}
                                            />
                                            {preset.name}
                                            <Box
                                                as="span"
                                                display="inline-flex"
                                                alignItems="center"
                                                color="rgba(255,255,255,0.35)"
                                                _hover={{ color: "red.300" }}
                                                ml="2px"
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); deletePreset(preset.id); }}
                                            >
                                                <LuX size={9} />
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        )}

                        {presets.length === 0 && !showNewPreset && (
                            <Text fontSize="10px" color="whiteAlpha.300" mb={1}>
                                No presets yet. Select resources then save as preset.
                            </Text>
                        )}

                        {showNewPreset && (
                            <Box mt={1} p={2} borderRadius="md" border="1px solid rgba(255,255,255,0.1)" bg="rgba(255,255,255,0.03)">
                                <input
                                    autoFocus
                                    placeholder="Preset name"
                                    value={presetName}
                                    onChange={(e) => setPresetName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") { setShowNewPreset(false); setPresetName(""); setIconSearch(""); setSelectedIconItemId(null); } }}
                                    style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "#fff", fontSize: 11, padding: "3px 6px", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
                                />
                                <Text fontSize="9px" color="whiteAlpha.400" mb={1} textTransform="uppercase" letterSpacing="wide">Icon</Text>
                                <input
                                    placeholder="Search item…"
                                    value={iconSearch}
                                    onChange={(e) => setIconSearch(e.target.value)}
                                    style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "#fff", fontSize: 11, padding: "3px 6px", outline: "none", marginBottom: 4, boxSizing: "border-box" }}
                                />
                                {iconSearchResults.length > 0 && (
                                    <Box display="flex" flexWrap="wrap" gap="3px" mb={1}>
                                        {iconSearchResults.map((r) => (
                                            <Box
                                                key={r.itemId}
                                                as="button"
                                                title={r.itemName}
                                                onClick={() => { setSelectedIconItemId(r.itemIconId); setIconSearch(r.itemName); }}
                                                p="2px"
                                                borderRadius="sm"
                                                border={`1px solid ${selectedIconItemId === r.itemIconId ? "rgba(212,240,0,0.6)" : "rgba(255,255,255,0.1)"}`}
                                                bg={selectedIconItemId === r.itemIconId ? "rgba(212,240,0,0.1)" : "transparent"}
                                                cursor="pointer"
                                                _hover={{ borderColor: "rgba(255,255,255,0.3)" }}
                                            >
                                                <img src={getItemIconUrl(r.itemIconId)} width={24} height={24} style={{ objectFit: "contain" }} />
                                            </Box>
                                        ))}
                                    </Box>
                                )}
                                <HStack gap={1} mt={1}>
                                    <Box
                                        as="button"
                                        flex={1}
                                        py="3px"
                                        borderRadius="sm"
                                        bg={presetName.trim() && selectedIconItemId ? "rgba(212,240,0,0.12)" : "rgba(255,255,255,0.05)"}
                                        color={presetName.trim() && selectedIconItemId ? "#d4f000" : "rgba(255,255,255,0.3)"}
                                        border={`1px solid ${presetName.trim() && selectedIconItemId ? "rgba(212,240,0,0.4)" : "rgba(255,255,255,0.1)"}`}
                                        fontSize="10px"
                                        fontWeight="600"
                                        cursor={presetName.trim() && selectedIconItemId ? "pointer" : "not-allowed"}
                                        onClick={savePreset}
                                    >
                                        Save
                                    </Box>
                                    <Box
                                        as="button"
                                        flex={1}
                                        py="3px"
                                        borderRadius="sm"
                                        bg="transparent"
                                        color="rgba(255,255,255,0.4)"
                                        border="1px solid rgba(255,255,255,0.1)"
                                        fontSize="10px"
                                        cursor="pointer"
                                        onClick={() => { setShowNewPreset(false); setPresetName(""); setIconSearch(""); setSelectedIconItemId(null); }}
                                    >
                                        Cancel
                                    </Box>
                                </HStack>
                            </Box>
                        )}
                    </Box>

                    <Box borderTop="1px solid rgba(255,255,255,0.06)" mb={2} />

                    {/* ── Resource grid ── */}
                    {jobGroups.map(([jobName, items]) => {
                        const groupItemIds = items.map((i) => i.itemId);
                        const allSelected = groupItemIds.every((id) => selectedResourceIds.includes(id));
                        return (
                            <Box key={jobName} mb={2}>
                                <HStack mb={1} gap={1}>
                                    <Text
                                        flex={1}
                                        fontSize="xs"
                                        fontWeight="semibold"
                                        color="whiteAlpha.600"
                                        textTransform="uppercase"
                                        letterSpacing="wide"
                                    >
                                        {jobName}
                                    </Text>
                                    <Tooltip.Root>
                                        <Tooltip.Trigger asChild>
                                            <IconButton
                                                aria-label={allSelected ? "Deselect all" : "Select all"}
                                                size="2xs"
                                                variant="ghost"
                                                color="whiteAlpha.500"
                                                _hover={{ color: "#d4f000" }}
                                                onClick={() => toggleJobGroup(groupItemIds, selectedResourceIds)}
                                            >
                                                {allSelected ? <LuMinus /> : <LuPlus />}
                                            </IconButton>
                                        </Tooltip.Trigger>
                                        <Tooltip.Positioner>
                                            <Tooltip.Content>
                                                {allSelected ? "Deselect all" : "Select all"}
                                            </Tooltip.Content>
                                        </Tooltip.Positioner>
                                    </Tooltip.Root>
                                </HStack>
                                <Box display="flex" flexWrap="wrap" w={`${GRID_WIDTH}px`} style={{ gap: `${ITEM_GAP}px` }}>
                                    {items.map((item) => {
                                        const isSelected = selectedResourceIds.includes(item.itemId);
                                        const isHighlighted = isSelected && highlightedResourceIds.includes(item.itemId);
                                        return (
                                            <Tooltip.Root key={item.itemId}>
                                                <Tooltip.Trigger asChild>
                                                    <Box
                                                        as="button"
                                                        onClick={() => toggleResource(item.itemId, selectedResourceIds)}
                                                        borderRadius="sm"
                                                        w={`${ITEM_SIZE}px`}
                                                        h={`${ITEM_SIZE}px`}
                                                        display="flex"
                                                        alignItems="center"
                                                        justifyContent="center"
                                                        p="2px"
                                                        cursor="pointer"
                                                        position="relative"
                                                        bg={isHighlighted ? "rgba(212,240,0,0.15)" : isSelected ? "rgba(255,255,255,0.2)" : "transparent"}
                                                        border={isHighlighted ? "1px solid rgba(212,240,0,0.5)" : "1px solid transparent"}
                                                        opacity={isSelected ? 1 : 0.35}
                                                        _hover={{ opacity: 1 }}
                                                        transition="all 0.1s"
                                                    >
                                                        <img
                                                            src={getItemIconUrl(item.itemIconId)}
                                                            alt={item.itemName}
                                                            width={32}
                                                            height={32}
                                                            style={{ objectFit: "contain" }}
                                                        />
                                                        {isSelected && (
                                                            <Box
                                                                as="span"
                                                                position="absolute"
                                                                top="1px"
                                                                right="1px"
                                                                w="12px"
                                                                h="12px"
                                                                display="flex"
                                                                alignItems="center"
                                                                justifyContent="center"
                                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleHighlight(item.itemId); }}
                                                                color={isHighlighted ? "#d4f000" : "rgba(255,255,255,0.3)"}
                                                                _hover={{ color: isHighlighted ? "#bfdb00" : "#d4f000" }}
                                                                zIndex={1}
                                                            >
                                                                <LuStar size={9} fill={isHighlighted ? "currentColor" : "none"} />
                                                            </Box>
                                                        )}
                                                    </Box>
                                                </Tooltip.Trigger>
                                                <Tooltip.Positioner>
                                                    <Tooltip.Content>
                                                        {item.itemName}
                                                    </Tooltip.Content>
                                                </Tooltip.Positioner>
                                            </Tooltip.Root>
                                        );
                                    })}
                                </Box>
                            </Box>
                        );
                    })}
                </Popover.Content>
            </Popover.Positioner>
        </Popover.Root>
    );
};

const resolveButtonIcon = (
    resources: ResourceWithJob[],
    selectedResourceIds: number[],
): { url: string; grayscale: boolean } => {
    if (selectedResourceIds.length === 0) {
        const defaultResource = resources.find((r) => r.itemId === DEFAULT_RESOURCE_ID);
        return { url: getItemIconUrl(defaultResource?.itemIconId ?? 0), grayscale: true };
    }
    const firstSelected = resources.find((r) => r.itemId === selectedResourceIds[0]);
    return { url: getItemIconUrl(firstSelected?.itemIconId ?? 0), grayscale: false };
};
