import { Badge, Box, HStack, IconButton, Popover, Text, Tooltip } from "@chakra-ui/react";
import { useStoreValue } from "@simplestack/store/react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { mapStore } from "../providers/store";
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
const POPOVER_PADDING = 8; // px (Chakra p={2} = 8px)
const SCROLLBAR_WIDTH = 15; // px — Chromium overlay scrollbar gutter
const GRID_WIDTH = ITEMS_PER_ROW * ITEM_SIZE + (ITEMS_PER_ROW - 1) * ITEM_GAP;
const POPOVER_WIDTH = GRID_WIDTH + POPOVER_PADDING * 2 + SCROLLBAR_WIDTH;

const setSelectedIds = (newIds: number[]) => {
    mapStore.set((v) => ({ ...v, selectedResourceIds: newIds }));
    window.api.saveConfig({ selectedResourceIds: newIds });
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

export const ResourcePickerButton = () => {
    const { data: resources } = useResourcesQuery();
    const selectedResourceIds = useStoreValue(mapStore, (s) => s.selectedResourceIds);
    if (!resources) return null;

    const jobGroups = groupResourcesByJob(resources);

    const buttonIcon = resolveButtonIcon(resources, selectedResourceIds);
    const extraCount = selectedResourceIds.length > 1 ? selectedResourceIds.length - 1 : 0;

    return (
        <Box position="absolute" bottom="8px" left="8px" zIndex={1000}>
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
                                style={{
                                    filter: buttonIcon.grayscale ? "grayscale(1)" : "none",
                                    objectFit: "contain",
                                }}
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
                        maxH="420px"
                        overflowY="auto"
                        bg="rgba(10, 12, 18, 0.97)"
                        border="1px solid rgba(255,255,255,0.12)"
                        borderRadius="md"
                        p={`${POPOVER_PADDING}px`}
                        style={{ scrollbarGutter: "stable" }}
                    >
                        {jobGroups.map(([jobName, items]) => {
                            const groupItemIds = items.map((i) => i.itemId);
                            const allSelected = groupItemIds.every((id) =>
                                selectedResourceIds.includes(id),
                            );
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
                                                    aria-label={
                                                        allSelected
                                                            ? "Deselect all"
                                                            : "Select all"
                                                    }
                                                    size="2xs"
                                                    variant="ghost"
                                                    color="whiteAlpha.500"
                                                    _hover={{ color: "#d4f000" }}
                                                    onClick={() =>
                                                        toggleJobGroup(
                                                            groupItemIds,
                                                            selectedResourceIds,
                                                        )
                                                    }
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
                                            const isSelected = selectedResourceIds.includes(
                                                item.itemId,
                                            );
                                            return (
                                                <Tooltip.Root key={item.itemId}>
                                                    <Tooltip.Trigger asChild>
                                                        <Box
                                                            as="button"
                                                            onClick={() =>
                                                                toggleResource(
                                                                    item.itemId,
                                                                    selectedResourceIds,
                                                                )
                                                            }
                                                            borderRadius="sm"
                                                            w={`${ITEM_SIZE}px`}
                                                            h={`${ITEM_SIZE}px`}
                                                            display="flex"
                                                            alignItems="center"
                                                            justifyContent="center"
                                                            p="2px"
                                                            cursor="pointer"
                                                            bg={
                                                                isSelected
                                                                    ? "rgba(255,255,255,0.2)"
                                                                    : "transparent"
                                                            }
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
        </Box>
    );
};

const resolveButtonIcon = (
    resources: ResourceWithJob[],
    selectedResourceIds: number[],
): { url: string; grayscale: boolean } => {
    if (selectedResourceIds.length === 0) {
        const defaultResource = resources.find((r) => r.itemId === DEFAULT_RESOURCE_ID);
        return {
            url: getItemIconUrl(defaultResource?.itemIconId ?? 0),
            grayscale: true,
        };
    }

    const firstSelected = resources.find((r) => r.itemId === selectedResourceIds[0]);
    return {
        url: getItemIconUrl(firstSelected?.itemIconId ?? 0),
        grayscale: false,
    };
};
