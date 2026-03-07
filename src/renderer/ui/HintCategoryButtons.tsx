import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useStoreValue } from "@simplestack/store/react";
import { db } from "../db";
import { mapStore } from "../providers/store";
import { useTranslations } from "../providers/TranslationsProvider";
import { getHintIconUrl } from "../resources/ResourcesList";

/** Category IDs to permanently exclude from the UI. */
const HIDDEN_CATEGORY_IDS: number[] = [];

interface HintCategory {
    id: number;
    nameId: number;
}

const toggleCategory = (categoryId: number) => {
    const current = mapStore.get().selectedHintCategoryIds;
    const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
    mapStore.set((v) => ({ ...v, selectedHintCategoryIds: next }));
};

export const HintCategoryButtons = () => {
    const selectedHintCategoryIds = useStoreValue(mapStore, (s) => s.selectedHintCategoryIds);

    const { data: categories } = useQuery({
        queryKey: ["hintCategories"],
        queryFn: () =>
            db.selectFrom("HintCategoryData").selectAll().execute() as Promise<HintCategory[]>,
    });

    // Fetch categories that have at least one hint globally (across all worldmaps)
    const { data: categoryIcons } = useQuery({
        queryKey: ["hintCategoryIcons"],
        queryFn: () =>
            db
                .selectFrom("HintData")
                .select(["categoryId", "gfx"])
                .groupBy("categoryId")
                .execute() as Promise<{ categoryId: number; gfx: number }[]>,
    });

    const nameIds = (categories ?? []).map((c) => String(c.nameId));
    const translations = useTranslations(nameIds);

    const iconByCategoryId = new Map((categoryIcons ?? []).map((r) => [r.categoryId, r.gfx]));
    const visibleCategories = (categories ?? []).filter(
        (c) => iconByCategoryId.has(c.id) && !HIDDEN_CATEGORY_IDS.includes(c.id),
    );

    // Initialize all categories as active on first load
    useEffect(() => {
        if (!visibleCategories.length) return;
        if (mapStore.get().selectedHintCategoryIds.length > 0) return;
        mapStore.set((v) => ({
            ...v,
            selectedHintCategoryIds: visibleCategories.map((c) => c.id),
        }));
    }, [visibleCategories.length]);

    if (!visibleCategories.length) return null;

    return (
        <div
            style={{
                position: "absolute",
                bottom: "50%",
                transform: "translateY(50%)",
                right: 8,
                zIndex: 1000,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                maxHeight: "calc(100% - 120px)",
                overflowY: "auto",
                overflowX: "hidden",
            }}
        >
            {visibleCategories.map((cat) => {
                const isActive = selectedHintCategoryIds.includes(cat.id);
                const name = translations?.[cat.nameId] ?? String(cat.nameId);
                const gfx = iconByCategoryId.get(cat.id);
                return (
                    <button
                        key={cat.id}
                        title={name}
                        onClick={() => toggleCategory(cat.id)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 8px",
                            height: 32,
                            minWidth: 32,
                            borderRadius: 6,
                            border: `1px solid ${isActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)"}`,
                            background: isActive ? "rgba(30,35,50,0.95)" : "rgba(10,12,18,0.85)",
                            color: isActive ? "#ffffff" : "rgba(255,255,255,0.45)",
                            cursor: "pointer",
                            fontSize: 11,
                            fontFamily: "sans-serif",
                            whiteSpace: "nowrap",
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            transition: "background 0.15s, color 0.15s",
                        }}
                    >
                        {gfx !== undefined && (
                            <img
                                src={getHintIconUrl(gfx)}
                                alt=""
                                width={18}
                                height={18}
                                style={{
                                    objectFit: "contain",
                                    flexShrink: 0,
                                    opacity: isActive ? 1 : 0.45,
                                }}
                            />
                        )}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                    </button>
                );
            })}
        </div>
    );
};
