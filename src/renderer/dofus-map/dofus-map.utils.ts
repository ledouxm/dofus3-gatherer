export interface WorldmapMeta {
    width: number;
    height: number;
    z_max: number;
    startScale: number;
    origineX: number;
    origineY: number;
    mapWidth: number;
    mapHeight: number;
}

/** Pixel coordinate in the full-resolution worldmap image. */
export interface WorldPoint {
    x: number;
    y: number;
}

/** Game map grid coordinate (integer = one sub-map). */
export interface DofusCoord {
    posX: number;
    posY: number;
}

/** Convert a Dofus map grid coordinate to a worldmap pixel position (top-left of that map cell). */
export function dofusToWorld(coord: DofusCoord, meta: WorldmapMeta): WorldPoint {
    return {
        x: meta.origineX + coord.posX * meta.mapWidth,
        y: meta.origineY + coord.posY * meta.mapHeight,
    };
}

/** Convert a worldmap pixel position to a Dofus map grid coordinate. */
export function worldToDofus(point: WorldPoint, meta: WorldmapMeta): DofusCoord {
    return {
        posX: (point.x - meta.origineX) / meta.mapWidth,
        posY: (point.y - meta.origineY) / meta.mapHeight,
    };
}

/** Size of one game map cell in worldmap pixels. */
export function getCellDimensions(meta: WorldmapMeta): WorldPoint {
    return { x: meta.mapWidth, y: meta.mapHeight };
}
