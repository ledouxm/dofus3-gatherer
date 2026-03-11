import { useEffect, useRef, useState } from "react";
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
import { useConfig } from "../providers/ConfigProvider";
import { toaster } from "../ui/toaster";
import { resolveTravelHandle } from "../resolveTravelHandle";

const TRAVEL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='32' viewBox='0 0 24 32'%3E%3Cpath d='M12 0 C5.4 0 0 5.4 0 12 C0 20 12 32 12 32 C12 32 24 20 24 12 C24 5.4 18.6 0 12 0Z' fill='black' stroke='white' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='4' fill='white'/%3E%3C/svg%3E") 12 32, pointer`;

interface Props {
    meta: WorldmapMeta;
    recoltables: Recoltable[];
    iconsByResourceId: Map<number, number>;
}

export function HoverCellLayer({ meta, recoltables, iconsByResourceId }: Props) {
    const map = useMap();
    const [hoveredCoord, setHoveredCoord] = useState<DofusCoord | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const hoveredHintName = useStoreValue(mapStore, (s) => s.hoveredHintName);
    const config = useConfig();
    const lastToastId = useRef<string | undefined>(undefined);
    const travelMode = config.travel?.sendToProcess === true;

    useEffect(() => {
        if (!map.getPane("hoverCellPane")) {
            map.createPane("hoverCellPane");
            map.getPane("hoverCellPane")!.style.zIndex = "390";
            map.getPane("hoverCellPane")!.style.pointerEvents = "none";
        }
    }, [map]);

    useEffect(() => {
        map.getContainer().style.cursor = travelMode ? TRAVEL_CURSOR : "";
        return () => { map.getContainer().style.cursor = ""; };
    }, [travelMode, map]);

    useEffect(() => {
        if (travelMode) {
            map.doubleClickZoom.disable();
        } else {
            map.doubleClickZoom.enable();
        }
    }, [travelMode, map]);

    useMapEvents({
        mousemove(e) {
            const raw = worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta);
            setHoveredCoord({ posX: Math.floor(raw.posX), posY: Math.floor(raw.posY) });
            setMousePos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        },
        mouseout() {
            setHoveredCoord(null);
            setMousePos(null);
        },
        click(e) {
            const copyEnabled = config.copyCoordinatesOnClick !== false;
            if (!copyEnabled) return;
            const c = worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta);
            const text = `/travel ${Math.floor(c.posX)} ${Math.floor(c.posY)}`;
            navigator.clipboard.writeText(text);
            if (lastToastId.current) toaster.dismiss(lastToastId.current);
            lastToastId.current = toaster.create({ title: <>Copied: <b>{text}</b></>, type: "success", duration: 2000 });
        },
        async dblclick(e) {
            const sendEnabled = config.travel?.sendToProcess === true;
            if (!sendEnabled) return;
            const c = worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta);
            const text = `/travel ${Math.floor(c.posX)} ${Math.floor(c.posY)}`;
            const handle = await resolveTravelHandle();
            if (handle !== null) {
                navigator.clipboard.writeText(text);
                window.api.focusWindowAndSend(handle, "travel");
                if (lastToastId.current) toaster.dismiss(lastToastId.current);
                lastToastId.current = toaster.create({
                    title: <>Voyage vers <b>[{Math.floor(c.posX)}, {Math.floor(c.posY)}]</b></>,
                    type: "success",
                    duration: 2000,
                });
            }
        },
    });

    const resourceQuantities = new Map<number, number>();
    if (hoveredCoord) {
        for (const r of recoltables) {
            if (r.posX !== hoveredCoord.posX || r.posY !== hoveredCoord.posY) continue;
            if (!iconsByResourceId.has(r.resourceId)) continue;
            resourceQuantities.set(r.resourceId, (resourceQuantities.get(r.resourceId) ?? 0) + r.quantity);
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
    const showTooltip = !!hoveredCoord && !!mousePos;

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
                        top: mousePos ? mousePos.y + 14 : 0,
                        left: mousePos ? mousePos.x + 14 : 0,
                        zIndex: 1000,
                        background: "rgba(0,0,0,0.85)",
                        padding: "6px 10px",
                        borderRadius: 6,
                        color: "#eee",
                        fontFamily: "sans-serif",
                        fontSize: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        alignItems: "flex-start",
                        opacity: showTooltip ? 1 : 0,
                        pointerEvents: "none",
                    }}
                >
                    <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                        [{hoveredCoord?.posX}, {hoveredCoord?.posY}]
                    </span>
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
