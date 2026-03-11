import { Badge, Flex, IconButton, Popover, Stack, Switch, Text } from "@chakra-ui/react";
import { useStoreValue } from "@simplestack/store/react";
import { useQuery } from "@tanstack/react-query";
import { LuLeaf } from "react-icons/lu";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";

interface Props {
    token: string;
    sessionCount: number;
}

export const AdminMapButton = ({ sessionCount }: Props) => {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const showHarvestedResources = useStoreValue(mapStore, (s) => s.showHarvestedResources);

    const { data: totalCount } = useQuery({
        queryKey: ["harvestMappingsCount", sessionCount],
        queryFn: async () => {
            const data = await window.api.getConfig({ filename: "element-resource-mappings.json" });
            if (!data || typeof data !== "object") return 0;
            return Object.keys(data).length;
        },
    });

    const mapperEnabled = config?.harvestMapper?.enabled ?? false;
    const showHarvested = config?.harvestMapper?.showHarvested ?? false;

    const toggleMapper = (checked: boolean) => {
        updateConfig.mutate({
            harvestMapper: { enabled: checked, showHarvested: config?.harvestMapper?.showHarvested ?? false },
        });
    };

    const toggleShowHarvested = (checked: boolean) => {
        updateConfig.mutate({
            harvestMapper: { enabled: config?.harvestMapper?.enabled ?? false, showHarvested: checked },
        });
        mapStore.set((v) => ({ ...v, showHarvestedResources: checked }));
    };

    const isActive = mapperEnabled || showHarvestedResources;

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton
                    aria-label="Admin harvest mapper"
                    size="sm"
                    variant="solid"
                    borderRadius="md"
                    bg="rgba(10, 12, 18, 0.85)"
                    border="1px solid"
                    borderColor={isActive ? "rgba(212,240,0,0.4)" : "rgba(255,255,255,0.1)"}
                    h="36px"
                    w="36px"
                    minW="36px"
                    color={isActive ? "#d4f000" : "whiteAlpha.700"}
                    _hover={{
                        bg: "rgba(30, 35, 50, 0.95)",
                        transform: "scale(1.1)",
                        boxShadow: "0 0 10px rgba(255,255,255,0.12)",
                        borderColor: "rgba(255,255,255,0.22)",
                    }}
                    transition="transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease"
                >
                    <LuLeaf />
                </IconButton>
            </Popover.Trigger>
            <Popover.Positioner>
                <Popover.Content
                    w="260px"
                    bg="rgba(10, 12, 18, 0.97)"
                    border="1px solid rgba(255,255,255,0.12)"
                    borderRadius="md"
                    p={4}
                >
                    <Stack gap={4}>
                        <Flex align="center" justify="space-between">
                            <Text fontSize="sm" color="whiteAlpha.800">Harvest mapper</Text>
                            <Switch.Root
                                checked={mapperEnabled}
                                onCheckedChange={(e) => toggleMapper(e.checked)}
                                colorPalette="yellow"
                            >
                                <Switch.HiddenInput />
                                <Switch.Control />
                            </Switch.Root>
                        </Flex>

                        <Flex align="center" justify="space-between">
                            <Text fontSize="sm" color="whiteAlpha.800">Show harvested only</Text>
                            <Switch.Root
                                checked={showHarvested}
                                onCheckedChange={(e) => toggleShowHarvested(e.checked)}
                                colorPalette="yellow"
                            >
                                <Switch.HiddenInput />
                                <Switch.Control />
                            </Switch.Root>
                        </Flex>

                        <Flex
                            align="center"
                            justify="space-between"
                            pt={2}
                            borderTop="1px solid"
                            borderColor="whiteAlpha.100"
                        >
                            <Text fontSize="xs" color="whiteAlpha.500">Total entries</Text>
                            <Badge colorPalette="yellow" variant="subtle" fontFamily="mono">
                                {totalCount ?? "—"}
                            </Badge>
                        </Flex>

                        {sessionCount > 0 && (
                            <Flex align="center" justify="space-between">
                                <Text fontSize="xs" color="whiteAlpha.500">This session</Text>
                                <Badge colorPalette="green" variant="subtle" fontFamily="mono">
                                    +{sessionCount}
                                </Badge>
                            </Flex>
                        )}
                    </Stack>
                </Popover.Content>
            </Popover.Positioner>
        </Popover.Root>
    );
};
