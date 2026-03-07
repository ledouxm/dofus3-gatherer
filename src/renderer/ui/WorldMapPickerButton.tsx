import { Box, IconButton, Menu } from "@chakra-ui/react";
import { useStoreValue } from "@simplestack/store/react";
import { LuMap } from "react-icons/lu";
import { useQueries } from "@tanstack/react-query";
import { mapStore } from "../providers/store";
import { db } from "../db";
import { useTranslations } from "../providers/TranslationsProvider";

export const WorldMapPickerButton = () => {
    const worldmapIds = useStoreValue(mapStore, (s) => s.worldmapIds);
    const selectedWorldmapId = useStoreValue(mapStore, (s) => s.selectedWorldmapId);
    const worldmapMetadata = useStoreValue(mapStore, (s) => s.worldmapMetadata);

    const nameIdQueries = useQueries({
        queries: worldmapIds.map((id) => ({
            queryKey: ["worldmapNameId", id],
            queryFn: () =>
                db
                    .selectFrom("WorldMapData")
                    .select("nameId")
                    .where("id", "=", Number(id))
                    .executeTakeFirst(),
        })),
    });

    const nameIds = nameIdQueries.map((q) => String(q.data?.nameId ?? ""));
    const translations = useTranslations(nameIds.filter(Boolean));

    if (!worldmapIds.length || !worldmapMetadata || !selectedWorldmapId) return null;

    const getName = (id: string, index: number) => {
        const nameId = String(nameIdQueries[index]?.data?.nameId ?? "");
        return (nameId && translations?.[nameId]) || `Worldmap ${id}`;
    };

    return (
        <Box position="absolute" bottom="52px" left="8px" zIndex={1000}>
            <Menu.Root
                onSelect={(details) =>
                    mapStore.set((v) => ({ ...v, selectedWorldmapId: details.value }))
                }
            >
                <Menu.Trigger asChild>
                    <IconButton
                        aria-label="Select worldmap"
                        size="sm"
                        variant="solid"
                        borderRadius="md"
                        bg="rgba(10, 12, 18, 0.85)"
                        _hover={{ bg: "rgba(30, 35, 50, 0.95)" }}
                        border="1px solid rgba(255,255,255,0.1)"
                        h="36px"
                        w="36px"
                        minW="36px"
                        color="whiteAlpha.700"
                        _active={{ color: "white" }}
                    >
                        <LuMap />
                    </IconButton>
                </Menu.Trigger>
                <Menu.Positioner>
                    <Menu.Content>
                        {worldmapIds.map((id, index) => (
                            <Menu.Item
                                key={id}
                                value={id}
                                fontWeight={id === selectedWorldmapId ? "bold" : "normal"}
                            >
                                {getName(id, index)}
                            </Menu.Item>
                        ))}
                    </Menu.Content>
                </Menu.Positioner>
            </Menu.Root>
        </Box>
    );
};
