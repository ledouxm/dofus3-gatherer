import { useRef, useState } from "react";
import { Polyline, useMapEvents } from "react-leaflet";
import { useConfig } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";
import { toaster } from "../ui/toaster";
import {
    getCellDimensions,
    dofusToWorld,
    type DofusCoord,
    worldToDofus,
    type WorldmapMeta,
} from "./dofus-map.utils";

export function MapGrid({ meta }: { meta: WorldmapMeta }) {
    const { width: W, height: H, origineX, origineY } = meta;
    const cell = getCellDimensions(meta);
    const lines: React.ReactElement[] = [];

    const xMin = Math.ceil(-origineX / cell.x);
    const xMax = Math.floor((W - origineX) / cell.x);
    for (let nx = xMin; nx <= xMax; nx++) {
        const { x } = dofusToWorld({ posX: nx, posY: 0 }, meta);
        lines.push(
            <Polyline
                interactive={false}
                key={`x${nx}`}
                positions={[
                    [0, x],
                    [-H, x],
                ]}
                color="red"
                weight={0.5}
                opacity={0.6}
            />,
        );
    }

    const yMin = Math.ceil(-origineY / cell.y);
    const yMax = Math.floor((H - origineY) / cell.y);
    for (let ny = yMin; ny <= yMax; ny++) {
        const { y } = dofusToWorld({ posX: 0, posY: ny }, meta);
        lines.push(
            <Polyline
                interactive={false}
                key={`y${ny}`}
                positions={[
                    [-y, 0],
                    [-y, W],
                ]}
                color="red"
                weight={0.5}
                opacity={0.6}
            />,
        );
    }

    return <>{lines}</>;
}

export function CoordDisplay({ meta }: { meta: WorldmapMeta }) {
    const [coord, setCoord] = useState<DofusCoord | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const config = useConfig();
    const lastToastId = useRef<string | undefined>(undefined);

    useMapEvents({
        mousemove(e) {
            setCoord(worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta));
            setMousePos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        },
        mouseout() {
            setCoord(null);
            setMousePos(null);
        },
        click(e) {
            const copyEnabled = config.copyCoordinatesOnClick !== false;
            const sendEnabled = config.travel?.sendToProcess === true;
            if (!copyEnabled && !sendEnabled) return;
            const c = worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta);
            const text = `/travel ${Math.floor(c.posX)} ${Math.floor(c.posY)}`;
            if (copyEnabled) {
                navigator.clipboard.writeText(text);
                if (lastToastId.current) toaster.dismiss(lastToastId.current);
                lastToastId.current = toaster.create({ title: <>Copied: <b>{text}</b></>, type: "success", duration: 2000 });
            }
            if (sendEnabled) {
                const handle = mapStore.get().travelHandle;
                if (handle !== null) {
                    if (!copyEnabled) navigator.clipboard.writeText(text);
                    window.api.focusWindowAndSend(handle, "travel");
                }
            }
        },
    });

    if (!coord || !mousePos) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: mousePos.x + 14,
                top: mousePos.y + 14,
                zIndex: 1000,
                background: "rgba(0,0,0,0.7)",
                padding: "2px 8px",
                borderRadius: 4,
                color: "#eee",
                fontFamily: "monospace",
                fontSize: 12,
                pointerEvents: "none",
            }}
        >
            [{Math.floor(coord.posX)}, {Math.floor(coord.posY)}]
        </div>
    );
}
