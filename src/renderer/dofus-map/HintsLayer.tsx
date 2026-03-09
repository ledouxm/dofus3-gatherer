import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMap, useMapEvents } from "react-leaflet";
import { useStoreValue } from "@simplestack/store/react";
import { db } from "../db";
import { mapStore } from "../providers/store";
import { getTranslation } from "../providers/TranslationsProvider";
import { getHintIconUrl } from "../resources/ResourcesList";
import { dofusToWorld, getCellDimensions, type WorldmapMeta } from "./dofus-map.utils";

interface HintPoint {
    id: number;
    x: number;
    y: number;
    nameId: number;
    categoryId: number;
    gfx: number;
    subareaNameId: number | null;
}


interface Props {
    meta: WorldmapMeta;
}

export const HintsLayer = ({ meta }: Props) => {
    const map = useMap();
    const selectedWorldmapId = useStoreValue(mapStore, (s) => s.selectedWorldmapId);
    const selectedHintCategoryIds = useStoreValue(mapStore, (s) => s.selectedHintCategoryIds);
    const drawRef = useRef<() => void>(() => {});
    const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null);

    const { data: hints } = useQuery({
        queryKey: ["hints", selectedWorldmapId],
        queryFn: () =>
            db
                .selectFrom("HintData")
                .leftJoin("SubAreaData", "SubAreaData.id", "HintData.subareaId")
                .where("HintData.worldMapId", "=", Number(selectedWorldmapId))
                .select(["HintData.id", "HintData.x", "HintData.y", "HintData.nameId", "HintData.categoryId", "HintData.gfx", "SubAreaData.nameId as subareaNameId"])
                .execute() as Promise<HintPoint[]>,
        enabled: selectedWorldmapId !== null,
    });

    const visibleHints = (hints ?? []).filter((h) => selectedHintCategoryIds.includes(h.categoryId));

    useEffect(() => {
        if (!visibleHints.length) return;

        const canvas = document.createElement("canvas");
        canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:401;";
        const container = map.getContainer();
        container.appendChild(canvas);

        const images = new Map<string, HTMLImageElement>();
        const loadImage = (url: string): HTMLImageElement => {
            if (images.has(url)) return images.get(url)!;
            const img = new Image();
            img.src = url;
            img.onload = () => drawRef.current();
            images.set(url, img);
            return img;
        };

        for (const h of visibleHints) loadImage(getHintIconUrl(h.gfx));

        const resize = () => {
            const { x, y } = map.getSize();
            canvas.width = x;
            canvas.height = y;
            drawRef.current();
        };

        let rafId = 0;
        const scheduleDraw = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(drawRef.current);
        };

        const { x: cellW, y: cellH } = getCellDimensions(meta);
        const getSize = () => Math.max(8, meta.mapWidth * Math.pow(2, map.getZoom() - meta.z_max) * 1.2);

        drawRef.current = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const { x: w, y: h } = map.getSize();
            ctx.clearRect(0, 0, w, h);

            const size = getSize();
            const half = size / 2;

            for (const hint of visibleHints) {
                const { x, y } = dofusToWorld({ posX: hint.x, posY: hint.y }, meta);
                const pt = map.latLngToContainerPoint([-(y + cellH / 2), x + cellW / 2]);
                const img = images.get(getHintIconUrl(hint.gfx));
                if (img?.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, pt.x - half, pt.y - half, size, size);
                } else {
                    ctx.fillStyle = "rgba(255,200,50,0.85)";
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, half, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };

        const hideCanvas = () => { canvas.style.display = "none"; };
        const showCanvas = () => { canvas.style.display = ""; drawRef.current(); };

        resize();
        map.on("resize", resize);
        map.on("move", scheduleDraw);
        map.on("moveend viewreset", drawRef.current);
        map.on("zoomstart", hideCanvas);
        map.on("zoomend", showCanvas);

        return () => {
            cancelAnimationFrame(rafId);
            map.off("resize", resize);
            map.off("move", scheduleDraw);
            map.off("moveend viewreset", drawRef.current);
            map.off("zoomstart", hideCanvas);
            map.off("zoomend", showCanvas);
            if (container.contains(canvas)) container.removeChild(canvas);
        };
    }, [map, visibleHints, meta]);

    const { x: cellW, y: cellH } = getCellDimensions(meta);
    const getHoverRadius = () => Math.max(8, meta.mapWidth * Math.pow(2, map.getZoom() - meta.z_max) * 1.2) / 2;

    useMapEvents({
        mousemove(e) {
            if (!visibleHints.length) { setTooltip(null); return; }
            let best: { dist: number; hint: HintPoint } | null = null;
            for (const hint of visibleHints) {
                const { x, y } = dofusToWorld({ posX: hint.x, posY: hint.y }, meta);
                const pt = map.latLngToContainerPoint([-(y + cellH / 2), x + cellW / 2]);
                const dist = Math.hypot(e.containerPoint.x - pt.x, e.containerPoint.y - pt.y);
                if (dist < getHoverRadius() && (!best || dist < best.dist)) {
                    best = { dist, hint };
                }
            }
            if (best) {
                const { x, y } = dofusToWorld({ posX: best.hint.x, posY: best.hint.y }, meta);
                const pt = map.latLngToContainerPoint([-(y + cellH / 2), x + cellW / 2]);
                const rect = map.getContainer().getBoundingClientRect();
                const hintName = getTranslation(best.hint.nameId);
                const subareaName = best.hint.subareaNameId ? getTranslation(best.hint.subareaNameId) : null;
                const name = hintName === "Zaap" && subareaName ? `Zaap - ${subareaName}` : hintName;
                setTooltip({
                    name,
                    x: rect.left + pt.x,
                    y: rect.top + pt.y,
                });
            } else {
                setTooltip(null);
            }
        },
        mouseout() {
            setTooltip(null);
        },
    });

    return createPortal(
        <div
            style={{
                position: "fixed",
                top: tooltip ? tooltip.y + 10 : 0,
                left: tooltip ? tooltip.x : 0,
                transform: "translateX(-50%)",
                zIndex: 1000,
                background: "rgba(0,0,0,0.85)",
                padding: "5px 10px",
                borderRadius: 6,
                color: "#eee",
                fontFamily: "sans-serif",
                fontSize: 12,
                whiteSpace: "nowrap",
                opacity: tooltip ? 1 : 0,
                pointerEvents: "none",
                transition: "opacity 0.15s ease",
            }}
        >
            {tooltip?.name}
        </div>,
        document.body,
    );
};
