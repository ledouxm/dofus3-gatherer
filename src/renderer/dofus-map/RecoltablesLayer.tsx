import { useQueries } from "@tanstack/react-query";
import { useStoreValue } from "@simplestack/store/react";
import { mapStore } from "../providers/store";
import { getRecoltables, type Recoltable } from "./dofus-map.api";
import { type WorldmapMeta } from "./dofus-map.utils";
import { SpritesLayer } from "./SpritesLayer";
import { getItemIconUrl } from "../resources/ResourcesList";
import { useMemo } from "react";
import { db } from "../db";
import { HoverCellLayer } from "./HoverCellLayer";

const aggregateByPosition = (recoltables: Recoltable[], resId: number, multiPos: Set<string>) => {
    const posMap = new Map<
        string,
        { posX: number; posY: number; count: number; hasMore: boolean }
    >();
    for (const r of recoltables) {
        const key = `${r.pos.posX},${r.pos.posY}`;
        const qty = r.quantities.find((q) => q.item === resId)?.quantity ?? 1;
        const existing = posMap.get(key);
        if (existing) {
            existing.count += qty;
        } else {
            posMap.set(key, {
                posX: r.pos.posX,
                posY: r.pos.posY,
                count: qty,
                hasMore: multiPos.has(key),
            });
        }
    }
    return Array.from(posMap.values());
};

interface Props {
    meta: WorldmapMeta;
}

export const RecoltablesLayer = ({ meta }: Props) => {
    const selectedResourceIds = useStoreValue(mapStore, (s) => s.selectedResourceIds);
    const selectedWorldmapId = useStoreValue(mapStore, (s) => s.selectedWorldmapId);
    const highlightedResourceIds = useStoreValue(mapStore, (s) => s.highlightedResourceIds);

    const iconsQueries = useQueries({
        queries: selectedResourceIds.map((resId) => ({
            queryKey: ["itemIcon", resId],
            queryFn: async () => {
                return await db
                    .selectFrom("ItemData")
                    .select(["id", "iconId"])
                    .where("id", "=", Number(resId))
                    .executeTakeFirstOrThrow();
            },
        })),
    });

    const queries = useQueries({
        queries: selectedResourceIds.map((id) => ({
            queryKey: ["recoltables", id],
            queryFn: () => getRecoltables([String(id)]) as Promise<Recoltable[]>,
        })),
    });

    const seen = new Set<string>();
    const recoltables = queries
        .flatMap((q) => q.data ?? [])
        .filter((recoltable) => {
            if (seen.has(recoltable.id)) return false;
            if (
                selectedWorldmapId !== null &&
                recoltable.pos.worldMap !== Number(selectedWorldmapId)
            )
                return false;
            seen.add(recoltable._id);
            return recoltable.resources.some((res) => selectedResourceIds.includes(res));
        });

    const groupedByResource = recoltables.reduce(
        (acc, r) => {
            r.resources.forEach((res) => {
                if (!selectedResourceIds.includes(res)) return;
                if (!acc[res]) acc[res] = [];

                acc[res].push(r);
            });
            return acc;
        },
        {} as Record<number, Recoltable[]>,
    );

    const iconsByResourceId = useMemo(() => {
        const map = new Map<number, number>();
        for (const q of iconsQueries) {
            if (q.data) map.set(q.data.id, q.data.iconId);
        }
        return map;
    }, [iconsQueries]);

    const multiResourcePositions = useMemo(() => {
        const posCount = new Map<string, number>();
        for (const recs of Object.values(groupedByResource)) {
            const seen = new Set<string>();
            for (const r of recs) {
                const key = `${r.pos.posX},${r.pos.posY}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    posCount.set(key, (posCount.get(key) ?? 0) + 1);
                }
            }
        }
        return new Set([...posCount.entries()].filter(([, c]) => c > 1).map(([k]) => k));
    }, [groupedByResource]);

    return (
        <>
            <SpritesLayer
                meta={meta}
                layers={Object.entries(groupedByResource).map(([resId, recoltables]) => ({
                    id: `resource-${resId}`,
                    spriteUrl: getItemIconUrl(
                        iconsQueries.find((q) => q.data?.id === Number(resId))?.data?.iconId ?? 0,
                    ),
                    coords: aggregateByPosition(recoltables, Number(resId), multiResourcePositions),
                    spriteSize: (zoom) =>
                        Math.max(6, meta.mapWidth * Math.pow(2, zoom - meta.z_max) * 1.2),
                    highlighted: highlightedResourceIds.includes(Number(resId)),
                }))}
            />
            <HoverCellLayer
                meta={meta}
                recoltables={recoltables}
                iconsByResourceId={iconsByResourceId}
            />
        </>
    );
};
