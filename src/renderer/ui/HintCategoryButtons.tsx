import { IconButton, Popover } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useStoreValue } from "@simplestack/store/react";
import { LuFilter } from "react-icons/lu";
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

const HintCategoryList = () => {
    const selectedHintCategoryIds = useStoreValue(mapStore, (s) => s.selectedHintCategoryIds);

    const { data: categories } = useQuery({
        queryKey: ["hintCategories"],
        queryFn: () =>
            db.selectFrom("HintCategoryData").selectAll().execute() as Promise<HintCategory[]>,
    });

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
                display: "flex",
                alignItems: "center",
                flexDirection: "column",
                gap: 4,
                maxHeight: 320,
                overflowY: "auto",
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
                            width: "100%",
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
                            maxWidth: 180,
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

export const HintFilterButton = () => {
    const selectedHintCategoryIds = useStoreValue(mapStore, (s) => s.selectedHintCategoryIds);
    const isActive = selectedHintCategoryIds.length > 0;

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton
                    aria-label="Filter hint categories"
                    size="sm"
                    variant="solid"
                    borderRadius="md"
                    bg="rgba(10, 12, 18, 0.85)"
                    border="1px solid rgba(255,255,255,0.1)"
                    h="36px"
                    w="36px"
                    minW="36px"
                    color={isActive ? "blue.400" : "whiteAlpha.700"}
                    transition="transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease"
                    _hover={{
                        bg: "rgba(30, 35, 50, 0.95)",
                        transform: "scale(1.1)",
                        boxShadow: "0 0 10px rgba(255,255,255,0.12)",
                        borderColor: "rgba(255,255,255,0.22)",
                    }}
                >
                    <LuFilter />
                </IconButton>
            </Popover.Trigger>
            <Popover.Positioner>
                <Popover.Content
                    w="220px"
                    bg="rgba(10, 12, 18, 0.97)"
                    border="1px solid rgba(255,255,255,0.12)"
                    borderRadius="md"
                    p={3}
                >
                    <HintCategoryList />
                </Popover.Content>
            </Popover.Positioner>
        </Popover.Root>
    );
};
