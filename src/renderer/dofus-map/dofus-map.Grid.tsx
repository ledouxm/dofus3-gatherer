import { useEffect, useRef, useState } from "react";
import { Polyline, useMap, useMapEvents } from "react-leaflet";
import { useConfig } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";
import { resolveTravelHandle } from "../resolveTravelHandle";
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

const TRAVEL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='32' viewBox='0 0 24 32'%3E%3Cpath d='M12 0 C5.4 0 0 5.4 0 12 C0 20 12 32 12 32 C12 32 24 20 24 12 C24 5.4 18.6 0 12 0Z' fill='black' stroke='white' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12' r='4' fill='white'/%3E%3C/svg%3E") 12 32, pointer`;

export function CoordDisplay({ meta }: { meta: WorldmapMeta }) {
    const [coord, setCoord] = useState<DofusCoord | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const config = useConfig();
    const lastToastId = useRef<string | undefined>(undefined);
    const map = useMap();
    const travelMode = config.travel?.sendToProcess === true;

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
            setCoord(worldToDofus({ x: e.latlng.lng, y: -e.latlng.lat }, meta));
            setMousePos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        },
        mouseout() {
            setCoord(null);
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

    if (!coord || !mousePos) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: mousePos.x + 14,
                top: mousePos.y + 14,
                zIndex: 500,
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
