import { useMutation } from "@tanstack/react-query";
import { useMappings } from "../providers/ConfigProvider";
import { useDofusEvent } from "../useDofusEvent";
import { useState } from "react";
import { db } from "../db";
import { gameStore } from "./game-store";
import { mapStore } from "../providers/store";
import { useStoreValue } from "@simplestack/store/react";
import { useEffect } from "react";
import { Box, IconButton } from "@chakra-ui/react";
import { LuLocate, LuLocateFixed } from "react-icons/lu";
import { Pane, Rectangle, useMap } from "react-leaflet";
import { dofusToWorld, getCellDimensions, type WorldmapMeta } from "../dofus-map/dofus-map.utils";

export function decodeCompressedCoords(compressedCoords: number): { x: number; y: number } {
    const toInt16 = (v: number): number => (v >= 32768 ? v - 65536 : v);

    const x = toInt16((compressedCoords & 0xffff0000) >>> 16);
    const y = toInt16(compressedCoords & 0xffff);
    return { x, y };
}

export const CharacterPosition = ({ meta }: { meta: WorldmapMeta }) => {
    const mappings = useMappings();

    const character = useStoreValue(gameStore.select("character"));

    const getMapPositionMutation = useMutation({
        mutationFn: async (mapId: number) => {
            const coords = await db
                .selectFrom("MapsCoordinateData_mapIds_junction")
                .where("target_id", "=", mapId)
                .leftJoin(
                    "MapsCoordinateData",
                    "MapsCoordinateData.id",
                    "MapsCoordinateData_mapIds_junction.MapsCoordinateData_id",
                )
                .select(["compressedCoords", "id"])
                .executeTakeFirst();

            const infos = await db
                .selectFrom("MapInformationData")
                .where("id", "=", mapId)
                .select(["worldMap", "subAreaId"])
                .executeTakeFirst();

            return { coords, infos };
        },
    });

    useDofusEvent(mappings.CurrentMapMessage, async (packet) => {
        const mapId = Number(packet.data[mappings["CurrentMapMessage.mapId"]!]);

        const { coords, infos } = await getMapPositionMutation.mutateAsync(mapId);

        if (coords && infos) {
            const { x, y } = decodeCompressedCoords(Number(coords.compressedCoords));
            console.log(
                `Decoded coordinates for mapId ${mapId}: x=${x}, y=${y}, worldMap=${infos.worldMap}, subAreaId=${infos.subAreaId}`,
            );

            const characterPosition = {
                position: [x, y] as [number, number],
                mapId: mapId,
                worldMapId: infos.worldMap,
                subAreaId: infos.subAreaId,
            };

            gameStore.set((state) => ({ ...state, character: characterPosition }));

            window.api.saveConfig({ characterPosition });
        }
    });

    return <PlayerMarker position={character?.position ?? [0, 0]} meta={meta} />;
};

interface Props {
    position: [number, number]; // [posX, posY] in Dofus grid coords
    meta: WorldmapMeta;
}

export const PlayerMarker = ({ position, meta }: Props) => {
    const map = useMap();
    const centerOnCharacter = useStoreValue(mapStore, (s) => s.centerOnCharacter);
    const [posX, posY] = position;
    const { x, y } = dofusToWorld({ posX, posY }, meta);
    const { x: cellW, y: cellH } = getCellDimensions(meta);
    const center: [number, number] = [-(y + cellH / 2), x + cellW / 2];

    useEffect(() => {
        const onDragStart = () => {
            mapStore.set((v) => ({ ...v, centerOnCharacter: false }));
            window.api.saveConfig({ centerOnCharacter: false });
        };
        map.on("dragstart", onDragStart);
        return () => {
            map.off("dragstart", onDragStart);
        };
    }, [map]);

    useEffect(() => {
        if (!centerOnCharacter) return;
        map.setView(center, map.getZoom(), { animate: false });
    }, [posX, posY, centerOnCharacter]);

    const bounds: [[number, number], [number, number]] = [
        [-y, x],
        [-(y + cellH), x + cellW],
    ];

    return (
        <Pane name="player-marker" style={{ zIndex: 450 }}>
            <Rectangle
                bounds={bounds}
                pathOptions={{
                    color: "#3b82f6",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.2,
                    weight: 2,
                }}
            />
        </Pane>
    );
};

export const CenterOnCharacterButton = () => {
    const centerOnCharacter = useStoreValue(mapStore, (s) => s.centerOnCharacter);

    const toggle = () => {
        const newValue = !centerOnCharacter;
        mapStore.set((v) => ({ ...v, centerOnCharacter: newValue }));
        window.api.saveConfig({ centerOnCharacter: newValue });
    };

    return (
        <Box position="absolute" bottom="8px" right="8px" zIndex={1000}>
            <IconButton
                aria-label="Centrer sur le personnage"
                size="sm"
                variant="solid"
                borderRadius="md"
                bg="rgba(10, 12, 18, 0.85)"
                border="1px solid rgba(255,255,255,0.1)"
                h="36px"
                w="36px"
                minW="36px"
                color={centerOnCharacter ? "blue.400" : "whiteAlpha.500"}
                transition="transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease"
                _hover={{
                    bg: "rgba(30, 35, 50, 0.95)",
                    transform: "scale(1.1)",
                    boxShadow: "0 0 10px rgba(255,255,255,0.12)",
                    borderColor: "rgba(255,255,255,0.22)",
                }}
                onClick={toggle}
            >
                {centerOnCharacter ? <LuLocateFixed /> : <LuLocate />}
            </IconButton>
        </Box>
    );
};
