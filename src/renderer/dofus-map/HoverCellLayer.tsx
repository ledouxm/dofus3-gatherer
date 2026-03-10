import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Rectangle, useMap, useMapEvents } from "react-leaflet";
import { useStoreValue } from "@simplestack/store/react";
import { type Recoltable } from "./dofus-map.api";
import {
    dofusToWorld,
    getCellDimensions,
    worldToDofus,
    type DofusCoord,
    type WorldmapMeta,
} from "./dofus-map.utils";
import { getItemIconUrl } from "../resources/ResourcesList";
import { mapStore } from "../providers/store";

interface Props {
    meta: WorldmapMeta;
    recoltables: Recoltable[];
    iconsByResourceId: Map<number, number>;
}

export function HoverCellLayer({ meta, recoltables, iconsByResourceId }: Props) {
    const map = useMap();
    const [hoveredCoord, setHoveredCoord] = useState<DofusCoord | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
    const hoveredHintName = useStoreValue(mapStore, (s) => s.hoveredHintName);

    useEffect(() => {
        if (!map.getPane("hoverCellPane")) {
            map.createPane("hoverCellPane");
            map.getPane("hoverCellPane")!.style.zIndex = "390";
            map.getPane("hoverCellPane")!.style.pointerEvents = "none";
        }
    }, [map]);

    useMapEvents({
        mousemove(e) {
            const raw = worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta);
            const coord: DofusCoord = {
                posX: Math.floor(raw.posX),
                posY: Math.floor(raw.posY),
            };
            setHoveredCoord(coord);

            // Compute viewport position of the bottom-center of the hovered cell
            const { x: cellW, y: cellH } = getCellDimensions(meta);
            const { x, y } = dofusToWorld(coord, meta);
            const bottomCenter = map.latLngToContainerPoint([-(y + cellH), x + cellW / 2]);
            const containerRect = map.getContainer().getBoundingClientRect();
            setTooltipPos({ x: containerRect.left + bottomCenter.x, y: containerRect.top + bottomCenter.y });

        },
        mouseout() {
            setHoveredCoord(null);
            setTooltipPos(null);
        },
    });

    const resourceQuantities = new Map<number, number>();
    if (hoveredCoord) {
        for (const r of recoltables) {
            if (r.pos.posX !== hoveredCoord.posX || r.pos.posY !== hoveredCoord.posY) continue;
            for (const q of r.quantities) {
                if (!iconsByResourceId.has(q.item)) continue;
                resourceQuantities.set(q.item, (resourceQuantities.get(q.item) ?? 0) + q.quantity);
            }
        }
    }

    // Compute rectangle bounds for the hovered cell
    const cellBounds = hoveredCoord
        ? (() => {
              const { x: cellW, y: cellH } = getCellDimensions(meta);
              const { x, y } = dofusToWorld(hoveredCoord, meta);
              return [
                  [-y, x],
                  [-(y + cellH), x + cellW],
              ] as [[number, number], [number, number]];
          })()
        : null;

    const hasResources = resourceQuantities.size > 0;
    const showTooltip = (hasResources || !!hoveredHintName) && !!tooltipPos;

    return (
        <>
            {cellBounds && (
                <Rectangle
                    bounds={cellBounds}
                    pane="hoverCellPane"
                    pathOptions={{
                        color: "#f59e0b",
                        fillColor: "#f59e0b",
                        fillOpacity: 0.2,
                        weight: 1.5,
                        opacity: 0.8,
                    }}
                    interactive={false}
                />
            )}
            {createPortal(
                <div
                    style={{
                        position: "fixed",
                        top: tooltipPos ? tooltipPos.y + 8 : 0,
                        left: tooltipPos ? tooltipPos.x : 0,
                        transform: `translateX(-50%) scale(${showTooltip ? 1 : 0.9})`,
                        zIndex: 1000,
                        background: "rgba(0,0,0,0.85)",
                        padding: hoveredHintName && !hasResources ? "6px 12px" : "10px 14px",
                        borderRadius: 8,
                        color: "#eee",
                        fontFamily: "sans-serif",
                        fontSize: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        alignItems: "center",
                        opacity: showTooltip ? 1 : 0,
                        transition: "opacity 0.2s ease, transform 0.2s ease",
                        pointerEvents: "none",
                    }}
                >
                    {hoveredHintName && (
                        <span style={{ whiteSpace: "nowrap", fontWeight: 500, fontSize: 12 }}>
                            {hoveredHintName}
                        </span>
                    )}
                    {hasResources && (
                        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                            {[...resourceQuantities.entries()].map(([itemId, qty]) => (
                                <div key={itemId} style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
                                    <img
                                        src={getItemIconUrl(iconsByResourceId.get(itemId) ?? 0)}
                                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                    />
                                    <span style={{
                                        position: "absolute",
                                        bottom: -4,
                                        right: -4,
                                        background: "rgba(0,0,0,0.75)",
                                        color: "#fff",
                                        fontSize: 10,
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        padding: "1px 3px",
                                        borderRadius: 3,
                                    }}>{qty}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
