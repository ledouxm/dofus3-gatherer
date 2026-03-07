import { Badge, Box, IconButton, Menu } from "@chakra-ui/react";
import { useStoreValue } from "@simplestack/store/react";
import { LuCheck } from "react-icons/lu";
import { mapStore } from "../providers/store";
import { getItemIconUrl } from "../resources/ResourcesList";
import {
    groupResourcesByJob,
    ResourceWithJob,
    useResourcesQuery,
} from "../resources/useResourcesQuery";

const DEFAULT_RESOURCE_ID = 303;

const toggleResource = (itemId: number) => {
    const current = mapStore.get();
    const newIds = current.selectedResourceIds.includes(itemId)
        ? current.selectedResourceIds.filter((id) => id !== itemId)
        : [...current.selectedResourceIds, itemId];

    mapStore.set((v) => ({ ...v, selectedResourceIds: newIds }));

    window.api.saveConfig({ selectedResourceIds: newIds });
};

export const ResourcePickerButton = () => {
    const { data: resources } = useResourcesQuery();
    const selectedResourceIds = useStoreValue(mapStore, (s) => s.selectedResourceIds);
    if (!resources) return null;

    const jobGroups = groupResourcesByJob(resources);
    const resourceById = new Map(resources.map((r) => [r.itemId, r]));

    const buttonIcon = resolveButtonIcon(resources, selectedResourceIds);
    const extraCount = selectedResourceIds.length > 1 ? selectedResourceIds.length - 1 : 0;

    return (
        <Box position="absolute" bottom="8px" left="8px" zIndex={1000}>
            <Menu.Root
                closeOnSelect={false}
                onSelect={(details) => toggleResource(Number(details.value))}
            >
                <Box position="relative" display="inline-flex">
                    <Menu.Trigger asChild>
                        <IconButton
                            aria-label="Select resources"
                            size="sm"
                            variant="solid"
                            borderRadius="md"
                            p={1}
                            bg="rgba(10, 12, 18, 0.85)"
                            _hover={{ bg: "rgba(30, 35, 50, 0.95)" }}
                            border="1px solid rgba(255,255,255,0.1)"
                            h="36px"
                            w="36px"
                            minW="36px"
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
                    </Menu.Trigger>
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
                <Menu.Positioner>
                    <Menu.Content maxH="500px" overflowY="auto">
                        {jobGroups.map(([jobName, items]) => (
                            <Menu.ItemGroup key={jobName}>
                                <Menu.ItemGroupLabel>{jobName}</Menu.ItemGroupLabel>
                                {items.map((item) => {
                                    const isSelected = selectedResourceIds.includes(item.itemId);
                                    return (
                                        <Menu.Item
                                            key={item.itemId}
                                            value={String(item.itemId)}
                                            display="flex"
                                            alignItems="center"
                                            gap={2}
                                        >
                                            <img
                                                src={getItemIconUrl(item.itemIconId)}
                                                alt={item.itemName}
                                                width={24}
                                                height={24}
                                                style={{ objectFit: "contain", flexShrink: 0 }}
                                            />
                                            <Menu.ItemText flex={1}>{item.itemName}</Menu.ItemText>
                                            {isSelected && <LuCheck />}
                                        </Menu.Item>
                                    );
                                })}
                            </Menu.ItemGroup>
                        ))}
                    </Menu.Content>
                </Menu.Positioner>
            </Menu.Root>
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
