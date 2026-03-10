import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { dofusToWorld, getCellDimensions, type WorldmapMeta } from "./dofus-map.utils";

export interface SpriteLayerDef {
    id: string;
    /** URL to the sprite image. */
    spriteUrl: string;
    coords: Array<{ posX: number; posY: number; count?: number; hasMore?: boolean }>;
    /** Rendered size in CSS pixels, or a function of zoom level (default: 16). */
    spriteSize?: number | ((zoom: number) => number);
    /** If true, drawn on top of other layers with a #d4f000 glow and larger size. */
    highlighted?: boolean;
}

interface Props {
    layers: SpriteLayerDef[];
    meta: WorldmapMeta;
}

/**
 * Renders multiple sprite layers on a single canvas for maximum efficiency.
 * All layers are drawn in one paint loop — no per-point React elements.
 */
export const SpritesLayer = ({ layers, meta }: Props) => {
    const map = useMap();
    // Keep a stable ref for the draw function so event listeners don't stale-close over old props.
    const drawRef = useRef<() => void>(() => {});

    useEffect(() => {
        const canvas = document.createElement("canvas");
        canvas.style.cssText =
            "position:absolute;top:0;left:0;pointer-events:none;z-index:402;";

        const container = map.getContainer();
        container.appendChild(canvas);

        // --- image cache ---
        const images = new Map<string, HTMLImageElement>();

        const loadImage = (url: string): HTMLImageElement => {
            if (images.has(url)) return images.get(url)!;
            const img = new Image();
            img.src = url;
            img.onload = () => drawRef.current();
            images.set(url, img);
            return img;
        };

        // Pre-load all sprites immediately.
        for (const layer of layers) loadImage(layer.spriteUrl);

        // --- resize canvas to match map container ---
        const resize = () => {
            const { x, y } = map.getSize();
            canvas.width = x;
            canvas.height = y;
            drawRef.current();
        };

        // --- main draw ---
        let rafId = 0;
        const scheduleDraw = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(drawRef.current);
        };

        const drawLayer = (ctx: CanvasRenderingContext2D, layer: SpriteLayerDef, zoom: number) => {
            const img = images.get(layer.spriteUrl);
            if (!img?.complete || img.naturalWidth === 0) return;

            const rawSize = layer.spriteSize ?? 16;
            const baseSize = typeof rawSize === "function" ? rawSize(zoom) : rawSize;
            const size = layer.highlighted ? baseSize * 1.5 : baseSize;
            const half = size / 2;

            const { x: cellW, y: cellH } = getCellDimensions(meta);

            if (layer.highlighted) {
                ctx.shadowBlur = size * 0.6;
                ctx.shadowColor = "#d4f000";
            }

            for (const coord of layer.coords) {
                const { x, y } = dofusToWorld(coord, meta);
                const pt = map.latLngToContainerPoint([-(y + cellH / 2), x + cellW / 2]);
                const ratio = img.naturalWidth / img.naturalHeight;
                const drawW = ratio >= 1 ? size : size * ratio;
                const drawH = ratio >= 1 ? size / ratio : size;
                ctx.drawImage(img, pt.x - drawW / 2, pt.y - drawH / 2, drawW, drawH);

                const badgeR = Math.max(6, size * 0.28);

                if (coord.count !== undefined && coord.count > 0) {
                    ctx.shadowBlur = 0;
                    const bx = pt.x + half - badgeR;
                    const by = pt.y + half - badgeR;
                    ctx.fillStyle = "rgba(0,0,0,0.75)";
                    ctx.beginPath();
                    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#fff";
                    ctx.font = `bold ${Math.round(badgeR * 1.3)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(String(coord.count), bx, by);
                    if (layer.highlighted) ctx.shadowBlur = size * 0.6;
                }

                if (coord.hasMore) {
                    ctx.shadowBlur = 0;
                    const pr = Math.max(4, size * 0.18);
                    const bx = pt.x - half + pr;
                    const by = pt.y - half + pr;
                    ctx.fillStyle = "#3b82f6";
                    ctx.beginPath();
                    ctx.arc(bx, by, pr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#fff";
                    ctx.font = `bold ${Math.round(pr * 1.4)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("+", bx, by + pr * 0.05);
                    if (layer.highlighted) ctx.shadowBlur = size * 0.6;
                }
            }

            if (layer.highlighted) ctx.shadowBlur = 0;
        };

        drawRef.current = () => {
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const { x: w, y: h } = map.getSize();
            ctx.clearRect(0, 0, w, h);
            const zoom = map.getZoom();
            // Draw normal layers first, highlighted on top
            for (const layer of layers) {
                if (!layer.highlighted) drawLayer(ctx, layer, zoom);
            }
            for (const layer of layers) {
                if (layer.highlighted) drawLayer(ctx, layer, zoom);
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
            container.removeChild(canvas);
        };
    }, [map, layers, meta]);

    return null;
};