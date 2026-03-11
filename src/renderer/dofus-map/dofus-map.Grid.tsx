import { Polyline } from "react-leaflet";
import {
    getCellDimensions,
    dofusToWorld,
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
