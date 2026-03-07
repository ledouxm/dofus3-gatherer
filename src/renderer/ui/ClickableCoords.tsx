import { Box, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { db } from "../db";
import { useClipboardToast } from "./useClipboardToast";

async function resolveCoords(mapId: number) {
    const row = await db
        .selectFrom("MapInformationData")
        .where("id", "=", mapId)
        .select(["posX", "posY"])
        .executeTakeFirst();
    if (!row) return null;
    return { x: row.posX, y: row.posY };
}

export function ClickableCoords({ mapId }: { mapId: number }) {
    const copy = useClipboardToast();
    const { data: coords } = useQuery({
        queryKey: ["mapCoords", mapId],
        queryFn: () => resolveCoords(mapId),
        staleTime: Infinity,
    });

    if (!coords) return null;

    const label = `[${coords.x} ; ${coords.y}]`;
    return (
        <Box
            as="button"
            onClick={() => copy(`/travel ${coords.x} ${coords.y}`, label)}
            cursor="pointer"
            bg="transparent"
            border="none"
            p={0}
            lineHeight={1}
        >
            <Text
                fontSize="xs"
                fontWeight="bold"
                color="whiteAlpha.500"
                _hover={{ color: "whiteAlpha.800" }}
                transition="color 0.1s"
            >
                {label}
            </Text>
        </Box>
    );
}
