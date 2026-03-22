import {
    Badge,
    Box,
    CloseButton,
    Dialog,
    Flex,
    HStack,
    Input,
    Text,
    VStack,
} from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { sql, type SqlBool } from "kysely";
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import {
    LuChevronDown,
    LuChevronRight,
    LuPackage,
    LuSearch,
    LuShoppingBasket,
    LuX,
} from "react-icons/lu";
import { db } from "../db";
import { getItemIconUrl } from "../resources/ResourcesList";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCENT = "#d4f000";
const border = "1px solid rgba(255,255,255,0.1)";
const panelBg = "rgba(10, 12, 18, 0.85)";
const inputStyle = {
    bg: "rgba(255,255,255,0.05)",
    border,
    borderRadius: "6px",
    fontSize: "12px",
    color: "white",
    _placeholder: { color: "whiteAlpha.400" },
    _focus: { borderColor: "rgba(212,240,0,0.4)", outline: "none", boxShadow: "none" },
} as const;
const inputErrorStyle = {
    ...inputStyle,
    border: "1px solid rgba(255,80,80,0.6)",
    _focus: { borderColor: "rgba(255,80,80,0.8)", outline: "none", boxShadow: "none" },
    _placeholder: { color: "rgba(255,80,80,0.5)" },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

type PricePer = 1 | 10 | 100;
type ItemPrice = { price: string; pricePer: PricePer };
type CraftingPrices = Record<string, ItemPrice>; // keyed by item ID as string

type ItemRow = { id: number; iconId: number; level: number; typeId: number; name: string };

type RecipeIngredient = {
    id: number;
    iconId: number;
    name: string;
    quantity: number;
    subRecipe?: RecipeResult;
};
type RecipeResult = {
    jobName: string;
    resultLevel: number;
    ingredients: RecipeIngredient[];
} | null;

type CraftEntry = {
    item: ItemRow;
    recipe: RecipeResult | "loading";
    craftQty: string;
};

// ── DB queries ────────────────────────────────────────────────────────────────

async function searchItems(input: string): Promise<ItemRow[]> {
    const isId = /^\d+$/.test(input.trim());
    let query = db
        .selectFrom("ItemData as i")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(i.nameId AS TEXT)`),
        )
        .select(["i.id", "i.iconId", "i.level", "i.typeId", (eb) => eb.ref("t.value").as("name")])
        .where("t.lang", "=", "fr");

    if (isId) {
        query = query.where("i.id", "=", Number(input.trim()));
    } else {
        query = query.where("t.value", "like", `%${input.trim()}%`);
    }

    return query.orderBy("i.level", "asc").limit(30).execute() as Promise<ItemRow[]>;
}

async function loadItemRecipe(itemId: number, depth = 3): Promise<RecipeResult> {
    const recipe = await db
        .selectFrom("RecipeData as r")
        .select(["r.id", "r.jobId", "r.resultLevel", "r.quantities"])
        .where("r.resultId", "=", itemId)
        .executeTakeFirst();

    if (!recipe) return null;

    const jobRow = await db
        .selectFrom("JobData as j")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(j.nameId AS TEXT)`),
        )
        .select([(eb) => eb.ref("t.value").as("jobName")])
        .where("j.id", "=", recipe.jobId)
        .where("t.lang", "=", "fr")
        .executeTakeFirst();

    const junctionRows = await db
        .selectFrom("RecipeData_ingredientIds_junction as j")
        .select(["j.target_id"])
        .where(sql<SqlBool>`j.RecipeData_id = ${recipe.id}`)
        .execute();

    const ingredientIds = junctionRows
        .map((r) => r.target_id)
        .filter((id): id is number => id !== null);

    if (ingredientIds.length === 0) {
        return { jobName: jobRow?.jobName ?? "", resultLevel: recipe.resultLevel, ingredients: [] };
    }

    const ingredientItems = await db
        .selectFrom("ItemData as i")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(i.nameId AS TEXT)`),
        )
        .select(["i.id", "i.iconId", (eb) => eb.ref("t.value").as("name")])
        .where("i.id", "in", ingredientIds)
        .where("t.lang", "=", "fr")
        .execute();

    let quantities: number[] = [];
    try {
        const parsed = JSON.parse(recipe.quantities);
        quantities = Array.isArray(parsed) ? parsed : Object.values(parsed).map(Number);
    } catch {
        /* ignore */
    }

    const ingredients: RecipeIngredient[] = ingredientIds
        .map((id, idx) => {
            const item = ingredientItems.find((i) => i.id === id);
            if (!item) return null;
            return {
                id: item.id,
                iconId: item.iconId,
                name: item.name ?? "",
                quantity: quantities[idx] ?? 1,
            };
        })
        .filter((x): x is RecipeIngredient => x !== null);

    if (depth > 0) {
        const subRecipes = await Promise.all(
            ingredients.map((ing) => loadItemRecipe(ing.id, depth - 1)),
        );
        ingredients.forEach((ing, idx) => {
            if (subRecipes[idx]) ing.subRecipe = subRecipes[idx]!;
        });
    }

    return { jobName: jobRow?.jobName ?? "", resultLevel: recipe.resultLevel, ingredients };
}

// ── Price helpers (pure, no React) ────────────────────────────────────────────

/** Returns per-unit kama price (0 if not set). The seam for packet autocomplete. */
function getUnitPrice(itemId: number, prices: CraftingPrices): number {
    const p = prices[String(itemId)];
    if (!p || !p.price) return 0;
    const v = parseFloat(p.price);
    return isNaN(v) ? 0 : v / p.pricePer;
}

/** Total cost of crafting via raw-leaf ingredients only (recursive). */
function calcRawCraftCost(
    ingredients: RecipeIngredient[],
    multiplier: number,
    prices: CraftingPrices,
): number {
    let total = 0;
    for (const ing of ingredients) {
        if (ing.subRecipe) {
            total += calcRawCraftCost(ing.subRecipe.ingredients, ing.quantity * multiplier, prices);
        } else {
            total += getUnitPrice(ing.id, prices) * ing.quantity * multiplier;
        }
    }
    return total;
}

function addSpaces(value: string): string {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

function formatKamas(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${Math.round(abs / 1_000_000)} Mk`;
    if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)} kk`;
    return `${sign}${Math.round(abs)} k`;
}

// ── Collectors ────────────────────────────────────────────────────────────────

function collectRawIngredients(
    ingredients: RecipeIngredient[],
    multiplier: number,
    acc: Map<number, { iconId: number; name: string; qty: number }>,
) {
    for (const ing of ingredients) {
        if (ing.subRecipe) {
            collectRawIngredients(ing.subRecipe.ingredients, ing.quantity * multiplier, acc);
        } else {
            const existing = acc.get(ing.id);
            if (existing) existing.qty += ing.quantity * multiplier;
            else
                acc.set(ing.id, {
                    iconId: ing.iconId,
                    name: ing.name,
                    qty: ing.quantity * multiplier,
                });
        }
    }
}

type CraftableIntermediate = {
    iconId: number;
    name: string;
    qty: number;
    subRecipe: NonNullable<RecipeResult>;
};

function collectCraftableIntermediates(
    ingredients: RecipeIngredient[],
    multiplier: number,
    acc: Map<number, CraftableIntermediate>,
) {
    for (const ing of ingredients) {
        if (ing.subRecipe) {
            const ex = acc.get(ing.id);
            if (ex) ex.qty += ing.quantity * multiplier;
            else
                acc.set(ing.id, {
                    iconId: ing.iconId,
                    name: ing.name,
                    qty: ing.quantity * multiplier,
                    subRecipe: ing.subRecipe,
                });
            collectCraftableIntermediates(
                ing.subRecipe.ingredients,
                ing.quantity * multiplier,
                acc,
            );
        }
    }
}

// ── Price hook (modular seam for future packet autocomplete) ──────────────────

function useCraftingPrices() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const prices = useMemo(
        () => (config?.harvests?.craftingPrices ?? {}) as CraftingPrices,
        [config],
    );

    /**
     * Primary price setter — used by both UI inputs and future packet listeners.
     * Future integration: import useCraftingPrices, call setPrice(itemId, { price: String(packetPrice) }).
     */
    const setPrice = useCallback(
        (itemId: number, patch: Partial<ItemPrice>) => {
            const current = prices[String(itemId)] ?? { price: "", pricePer: 1 as PricePer };
            updateConfig.mutate({
                harvests: {
                    ...config?.harvests,
                    craftingPrices: { ...prices, [String(itemId)]: { ...current, ...patch } },
                },
            });
        },
        [config, prices, updateConfig],
    );

    return { prices, setPrice };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ItemIcon({ iconId, size = 24 }: { iconId: number; size?: number }) {
    const renderCount = useRef(0);
    console.log(`[ItemIcon id=${iconId}] render #${++renderCount.current}`);
    const [errored, setErrored] = useState(false);
    if (errored) {
        return (
            <Box
                w={`${size}px`}
                h={`${size}px`}
                bg="rgba(255,255,255,0.06)"
                borderRadius="4px"
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
            >
                <LuPackage size={size * 0.6} color="rgba(255,255,255,0.3)" />
            </Box>
        );
    }
    return (
        <img
            src={getItemIconUrl(iconId)}
            width={size}
            height={size}
            style={{ objectFit: "contain", borderRadius: "4px", flexShrink: 0 }}
            onError={() => setErrored(true)}
        />
    );
}

function LevelBadge({ level }: { level: number }) {
    return (
        <Badge
            fontSize="10px"
            px="5px"
            py="1px"
            w="40px"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            bg="rgba(255,255,255,0.08)"
            color="whiteAlpha.600"
            borderRadius="4px"
            fontWeight="600"
            flexShrink={0}
        >
            Lv.{level}
        </Badge>
    );
}

const PriceRow = memo(function PriceRow({
    itemId,
    prices,
    setPrice,
    required = false,
}: {
    itemId: number;
    prices: CraftingPrices;
    setPrice: (id: number, patch: Partial<ItemPrice>) => void;
    required?: boolean;
}) {
    const renderCount = useRef(0);
    console.log(`[PriceRow id=${itemId}] render #${++renderCount.current}`);
    const p = prices[String(itemId)];
    const committedPrice = p?.price ?? "";
    const pricePer = p?.pricePer ?? 1;

    const [localPrice, setLocalPrice] = useState(committedPrice);

    // Sync local state when the committed value changes externally (e.g. packet autocomplete)
    useEffect(() => {
        setLocalPrice(committedPrice);
    }, [committedPrice]);

    useDebounce(
        () => {
            setPrice(itemId, { price: localPrice });
        },
        400,
        [localPrice],
    );

    const hasError = required && !localPrice;

    return (
        <HStack gap={1} mt={1} flexWrap="wrap">
            <Input
                value={addSpaces(localPrice)}
                onChange={(e) => setLocalPrice(e.target.value.replace(/\D/g, ""))}
                placeholder="prix"
                size="xs"
                w="100px"
                maxW="100%"
                h="24px"
                type="text"
                flexShrink={0}
                {...(hasError ? inputErrorStyle : inputStyle)}
            />
            {([1, 10, 100] as PricePer[]).map((p) => (
                <Box
                    key={p}
                    as="button"
                    onClick={() => setPrice(itemId, { pricePer: p })}
                    px="5px"
                    py="1px"
                    fontSize="10px"
                    fontWeight="600"
                    borderRadius="4px"
                    border="1px solid"
                    borderColor={pricePer === p ? ACCENT : "rgba(255,255,255,0.12)"}
                    color={pricePer === p ? ACCENT : "rgba(255,255,255,0.4)"}
                    bg={pricePer === p ? `${ACCENT}18` : "transparent"}
                    cursor="pointer"
                    style={{ outline: "none" }}
                >
                    ×{p}
                </Box>
            ))}
        </HStack>
    );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Text
            fontSize="10px"
            fontWeight="600"
            color="whiteAlpha.400"
            letterSpacing="0.08em"
            mt={3}
            mb={1}
        >
            {children}
        </Text>
    );
}

function SubRecipeTree({
    recipe,
    expandedSubs,
    toggleSub,
    multiplier = 1,
}: {
    recipe: RecipeResult;
    expandedSubs: Set<number>;
    toggleSub: (id: number) => void;
    multiplier?: number;
}) {
    const renderCount = useRef(0);
    console.log(`[SubRecipeTree] render #${++renderCount.current}`);
    if (!recipe) return null;
    return (
        <VStack align="stretch" gap={1}>
            {recipe.ingredients.map((sub) => (
                <Box key={sub.id}>
                    <HStack gap={2} py="2px">
                        <ItemIcon iconId={sub.iconId} size={14} />
                        <Text fontSize="10px" color="whiteAlpha.600" flex={1} minW="0" truncate>
                            {sub.name}
                        </Text>
                        <Text fontSize="10px" color="whiteAlpha.400" flexShrink={0}>
                            ×{sub.quantity * multiplier}
                        </Text>
                        {sub.subRecipe && (
                            <Box
                                as="button"
                                onClick={() => toggleSub(sub.id)}
                                fontSize="9px"
                                color="whiteAlpha.400"
                                _hover={{ color: "white" }}
                                bg="transparent"
                                border="none"
                                cursor="pointer"
                                flexShrink={0}
                                style={{ outline: "none" }}
                            >
                                {expandedSubs.has(sub.id) ? "▲" : "▼"}
                            </Box>
                        )}
                    </HStack>
                    {sub.subRecipe && expandedSubs.has(sub.id) && (
                        <Box pl={3} borderLeft="2px solid rgba(255,255,255,0.08)" ml={1}>
                            <SubRecipeTree
                                recipe={sub.subRecipe}
                                expandedSubs={expandedSubs}
                                toggleSub={toggleSub}
                                multiplier={sub.quantity * multiplier}
                            />
                        </Box>
                    )}
                </Box>
            ))}
        </VStack>
    );
}

// ── Saved entry shape (persisted to config) ───────────────────────────────────

type SavedEntry = {
    item: ItemRow;
    craftQty: string;
};

// ── Main component ────────────────────────────────────────────────────────────

export function CraftingPanel() {
    const renderCount = useRef(0);
    console.log(`[CraftingPanel] render #${++renderCount.current}`);
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const queryClient = useQueryClient();
    const { prices, setPrice } = useCraftingPrices();

    const [entries, setEntries] = useState<CraftEntry[]>([]);
    const [collapsedEntries, setCollapsedEntries] = useState<Set<number>>(new Set());
    const toggleCollapsed = (id: number) =>
        setCollapsedEntries((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set());
    const toggleSub = (id: number) =>
        setExpandedSubs((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<"qty" | "price">("qty");
    const [searchInput, setSearchInput] = useState("");
    const [searchResults, setSearchResults] = useState<ItemRow[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [focused, setFocused] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const hasRestoredEntries = useRef(false);
    const isRestoring = useRef(false);

    // Restore persisted entries on mount
    useEffect(() => {
        if (!config || hasRestoredEntries.current) return;
        hasRestoredEntries.current = true;
        const saved = config.harvests?.craftingEntries as SavedEntry[] | undefined;
        if (!saved || saved.length === 0) return;

        isRestoring.current = true;
        setEntries(saved.map((e) => ({ ...e, recipe: "loading" as const })));

        Promise.all(
            saved.map((e) =>
                queryClient.fetchQuery({
                    queryKey: ["explorer-item-recipe", e.item.id],
                    queryFn: () => loadItemRecipe(e.item.id),
                    staleTime: Infinity,
                }),
            ),
        ).then((recipes) => {
            setEntries(
                saved.map((e, idx) => ({ ...e, recipe: recipes[idx] })),
            );
            isRestoring.current = false;
        });
    }, [config]);

    // Auto-save entries to config (debounced, skip before/during restore)
    useDebounce(
        () => {
            if (!hasRestoredEntries.current || isRestoring.current) return;
            const toSave: SavedEntry[] = entries.map((e) => ({
                item: e.item,
                craftQty: e.craftQty,
            }));
            updateConfig.mutate({ harvests: { ...config?.harvests, craftingEntries: toSave } });
        },
        500,
        [entries],
    );

    useDebounce(
        () => {
            if (!searchInput.trim()) {
                setSearchResults([]);
                return;
            }
            searchItems(searchInput).then((res) => {
                setSearchResults(res);
                setShowResults(true);
            });
        },
        200,
        [searchInput],
    );

    const craftingHistory = (config?.harvests?.craftingHistory ?? []) as ItemRow[];

    const addItem = async (item: ItemRow) => {
        if (entries.some((e) => e.item.id === item.id)) {
            setShowResults(false);
            setSearchInput("");
            return;
        }

        setEntries((prev) => [...prev, { item, recipe: "loading", craftQty: "1" }]);
        setShowResults(false);
        setSearchInput("");

        const newHistory = [item, ...craftingHistory.filter((h) => h.id !== item.id)].slice(0, 10);
        updateConfig.mutate({ harvests: { ...config?.harvests, craftingHistory: newHistory } });

        const recipe = await queryClient.fetchQuery({
            queryKey: ["explorer-item-recipe", item.id],
            queryFn: () => loadItemRecipe(item.id),
            staleTime: Infinity,
        });

        setEntries((prev) => prev.map((e) => (e.item.id === item.id ? { ...e, recipe } : e)));
    };

    const updateCraftQty = (itemId: number, craftQty: string) => {
        setEntries((prev) => prev.map((e) => (e.item.id === itemId ? { ...e, craftQty } : e)));
    };

    const removeEntry = (itemId: number) =>
        setEntries((prev) => prev.filter((e) => e.item.id !== itemId));

    // ── Derived data ──────────────────────────────────────────────────────────

    const totalRawMap = useMemo(() => {
        const map = new Map<number, { iconId: number; name: string; qty: number }>();
        for (const e of entries) {
            if (e.recipe === null || e.recipe === "loading") continue;
            const qty = Math.max(1, parseInt(e.craftQty || "1", 10));
            collectRawIngredients(e.recipe.ingredients, qty, map);
        }
        return map;
    }, [entries]);

    const totalRawList = useMemo(
        () =>
            [...totalRawMap.entries()]
                .map(([id, v]) => ({ id, ...v }))
                .sort((a, b) => b.qty - a.qty),
        [totalRawMap],
    );

    const craftableIntermediatesMap = useMemo(() => {
        const map = new Map<number, CraftableIntermediate>();
        for (const e of entries) {
            if (e.recipe === null || e.recipe === "loading") continue;
            const qty = Math.max(1, parseInt(e.craftQty || "1", 10));
            collectCraftableIntermediates(e.recipe.ingredients, qty, map);
        }
        return map;
    }, [entries]);

    const craftableIntermediatesList = useMemo(
        () => [...craftableIntermediatesMap.entries()],
        [craftableIntermediatesMap],
    );

    // ── Price calculations ────────────────────────────────────────────────────

    const intermediateCraftCosts = useMemo(() => {
        const result = new Map<number, number>();
        for (const [itemId, ci] of craftableIntermediatesMap) {
            result.set(itemId, calcRawCraftCost(ci.subRecipe.ingredients, ci.qty, prices));
        }
        return result;
    }, [craftableIntermediatesMap, prices]);

    const totalRawCost = useMemo(
        () =>
            [...totalRawMap.entries()].reduce(
                (sum, [id, r]) => sum + getUnitPrice(id, prices) * r.qty,
                0,
            ),
        [totalRawMap, prices],
    );

    const totalRevenue = useMemo(
        () =>
            entries.reduce((sum, e) => {
                const qty = Math.max(1, parseInt(e.craftQty || "1", 10));
                return sum + getUnitPrice(e.item.id, prices) * qty;
            }, 0),
        [entries, prices],
    );

    const margin = totalRevenue - totalRawCost;

    const allRawPricesSet = useMemo(
        () =>
            [...totalRawMap.keys()].every((id) => {
                const p = prices[String(id)];
                return p && p.price !== "";
            }),
        [totalRawMap, prices],
    );

    return (
        <Flex flex={1} direction="column" overflow="hidden" bg={panelBg}>
            {/* Search bar */}
            <Box px={3} pt={3} pb={2} flexShrink={0} position="relative" ref={searchRef}>
                <Box position="relative">
                    <Box
                        position="absolute"
                        left="10px"
                        top="50%"
                        transform="translateY(-50%)"
                        color="whiteAlpha.400"
                        pointerEvents="none"
                        zIndex={1}
                    >
                        <LuSearch size={14} />
                    </Box>
                    <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onFocus={() => {
                            setFocused(true);
                            if (searchResults.length > 0) setShowResults(true);
                        }}
                        onBlur={() => {
                            setFocused(false);
                            setTimeout(() => setShowResults(false), 150);
                        }}
                        placeholder="Rechercher un item à crafter…"
                        pl="32px"
                        size="sm"
                        {...inputStyle}
                    />
                </Box>

                {/* Dropdown: recents (empty input) or search results */}
                {(focused && !searchInput.trim() && craftingHistory.length > 0) ||
                (showResults && searchResults.length > 0) ? (
                    <Box
                        position="absolute"
                        top="calc(100% - 4px)"
                        left="12px"
                        right="12px"
                        zIndex={100}
                        bg="rgba(14,16,24,0.98)"
                        border={border}
                        borderRadius="6px"
                        maxH="200px"
                        overflowY="auto"
                    >
                        {!searchInput.trim() ? (
                            <>
                                <Box px={3} pt={2} pb={1}>
                                    <Text
                                        fontSize="10px"
                                        color="whiteAlpha.400"
                                        fontWeight="600"
                                        letterSpacing="wider"
                                    >
                                        RÉCENTS
                                    </Text>
                                </Box>
                                {craftingHistory.map((h) => (
                                    <HStack
                                        key={h.id}
                                        px={3}
                                        py="7px"
                                        gap={2}
                                        cursor="pointer"
                                        _hover={{ bg: "rgba(255,255,255,0.06)" }}
                                        borderBottom={border}
                                        onMouseDown={() => setSearchInput(h.name)}
                                    >
                                        <ItemIcon iconId={h.iconId} size={20} />
                                        <Text
                                            fontSize="xs"
                                            color="white"
                                            flex={1}
                                            minW="0"
                                            truncate
                                        >
                                            {h.name}
                                        </Text>
                                        <LevelBadge level={h.level} />
                                    </HStack>
                                ))}
                            </>
                        ) : (
                            searchResults.map((item) => (
                                <HStack
                                    key={item.id}
                                    px={3}
                                    py="7px"
                                    gap={2}
                                    cursor="pointer"
                                    _hover={{ bg: "rgba(255,255,255,0.06)" }}
                                    borderBottom={border}
                                    onMouseDown={() => addItem(item)}
                                >
                                    <ItemIcon iconId={item.iconId} size={20} />
                                    <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                        {item.name}
                                    </Text>
                                    <LevelBadge level={item.level} />
                                </HStack>
                            ))
                        )}
                    </Box>
                ) : null}
            </Box>

            {/* Entry list */}
            <Box flex={1} overflowY="auto" px={3} pb={3}>
                {entries.length === 0 && (
                    <Flex h="60px" align="center" justify="center">
                        <Text fontSize="xs" color="whiteAlpha.300">
                            Aucun item sélectionné.
                        </Text>
                    </Flex>
                )}
                <VStack align="stretch" gap={3}>
                    {entries.map((entry) => {
                        const craftQtyNum = Math.max(1, parseInt(entry.craftQty || "1", 10));
                        return (
                            <Box
                                key={entry.item.id}
                                border={border}
                                borderRadius="8px"
                                bg="rgba(255,255,255,0.02)"
                                overflow="hidden"
                            >
                                {/* Item header */}
                                <HStack
                                    px={3}
                                    py={2}
                                    borderBottom={border}
                                    gap={2}
                                    bg="rgba(255,255,255,0.03)"
                                >
                                    <Box
                                        as="button"
                                        onClick={() => toggleCollapsed(entry.item.id)}
                                        color="whiteAlpha.400"
                                        _hover={{ color: "white" }}
                                        bg="transparent"
                                        border="none"
                                        cursor="pointer"
                                        display="flex"
                                        alignItems="center"
                                        p={0}
                                        style={{ outline: "none" }}
                                    >
                                        {collapsedEntries.has(entry.item.id) ? (
                                            <LuChevronRight size={14} />
                                        ) : (
                                            <LuChevronDown size={14} />
                                        )}
                                    </Box>
                                    <ItemIcon iconId={entry.item.iconId} size={22} />
                                    <Text
                                        fontSize="sm"
                                        fontWeight="600"
                                        color="white"
                                        flex={1}
                                        truncate
                                    >
                                        {entry.item.name}
                                    </Text>
                                    <Input
                                        value={entry.craftQty}
                                        onChange={(e) =>
                                            updateCraftQty(entry.item.id, e.target.value)
                                        }
                                        size="xs"
                                        w="52px"
                                        type="number"
                                        min={1}
                                        flexShrink={0}
                                        {...inputStyle}
                                    />
                                    <LevelBadge level={entry.item.level} />
                                    <Box
                                        as="button"
                                        onClick={() => removeEntry(entry.item.id)}
                                        color="whiteAlpha.400"
                                        _hover={{ color: "white" }}
                                        bg="transparent"
                                        border="none"
                                        cursor="pointer"
                                        display="flex"
                                        alignItems="center"
                                        p={0}
                                        style={{ outline: "none" }}
                                    >
                                        <LuX size={14} />
                                    </Box>
                                </HStack>

                                {/* Ingredients */}
                                {!collapsedEntries.has(entry.item.id) && (
                                    <Box px={3} py={2}>
                                        {entry.recipe === "loading" && (
                                            <Text fontSize="11px" color="whiteAlpha.300">
                                                Chargement de la recette…
                                            </Text>
                                        )}
                                        {entry.recipe === null && (
                                            <Text fontSize="11px" color="whiteAlpha.300">
                                                Pas de recette trouvée.
                                            </Text>
                                        )}
                                        {entry.recipe !== null && entry.recipe !== "loading" && (
                                            <>
                                                <HStack mb={2} gap={2}>
                                                    <Text
                                                        fontSize="10px"
                                                        fontWeight="600"
                                                        color="whiteAlpha.400"
                                                        letterSpacing="0.08em"
                                                    >
                                                        INGRÉDIENTS
                                                    </Text>
                                                    <Badge
                                                        fontSize="10px"
                                                        px="5px"
                                                        colorPalette="yellow"
                                                        borderRadius="4px"
                                                    >
                                                        {entry.recipe.jobName}
                                                    </Badge>
                                                </HStack>
                                                <VStack align="stretch" gap={2}>
                                                    {entry.recipe.ingredients.map((ing) => {
                                                        const requiredQty =
                                                            ing.quantity * craftQtyNum;
                                                        return (
                                                            <Box
                                                                key={ing.id}
                                                                px={2}
                                                                py={2}
                                                                bg="rgba(255,255,255,0.02)"
                                                                borderRadius="6px"
                                                                border={border}
                                                            >
                                                                <HStack gap={2}>
                                                                    <ItemIcon
                                                                        iconId={ing.iconId}
                                                                        size={18}
                                                                    />
                                                                    <Text
                                                                        fontSize="xs"
                                                                        color="white"
                                                                        flex={1}
                                                                        minW="0"
                                                                        truncate
                                                                    >
                                                                        {ing.name}
                                                                    </Text>
                                                                    <Text
                                                                        fontSize="11px"
                                                                        color={ACCENT}
                                                                        fontWeight="600"
                                                                        flexShrink={0}
                                                                    >
                                                                        ×{requiredQty}
                                                                    </Text>
                                                                    {ing.subRecipe && (
                                                                        <Box
                                                                            as="button"
                                                                            onClick={() =>
                                                                                toggleSub(ing.id)
                                                                            }
                                                                            fontSize="10px"
                                                                            color="whiteAlpha.400"
                                                                            _hover={{
                                                                                color: "white",
                                                                            }}
                                                                            bg="transparent"
                                                                            border="none"
                                                                            cursor="pointer"
                                                                            flexShrink={0}
                                                                            style={{
                                                                                outline: "none",
                                                                            }}
                                                                        >
                                                                            {expandedSubs.has(
                                                                                ing.id,
                                                                            )
                                                                                ? "▲"
                                                                                : "▼"}
                                                                        </Box>
                                                                    )}
                                                                </HStack>
                                                                {ing.subRecipe &&
                                                                    expandedSubs.has(ing.id) && (
                                                                        <Box
                                                                            mt={2}
                                                                            pl={2}
                                                                            borderLeft="2px solid rgba(255,255,255,0.08)"
                                                                        >
                                                                            <SubRecipeTree
                                                                                recipe={
                                                                                    ing.subRecipe
                                                                                }
                                                                                expandedSubs={
                                                                                    expandedSubs
                                                                                }
                                                                                toggleSub={
                                                                                    toggleSub
                                                                                }
                                                                                multiplier={
                                                                                    craftQtyNum
                                                                                }
                                                                            />
                                                                        </Box>
                                                                    )}
                                                            </Box>
                                                        );
                                                    })}
                                                    {entry.recipe.ingredients.length === 0 && (
                                                        <Text fontSize="xs" color="whiteAlpha.300">
                                                            Ingrédients non trouvés.
                                                        </Text>
                                                    )}
                                                </VStack>
                                            </>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </VStack>
            </Box>

            {/* Bottom bar */}
            <Box flexShrink={0} borderTop={border} px={3} py={3} bg="rgba(10,12,18,0.95)">
                <Box
                    as="button"
                    w="100%"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    gap="8px"
                    py={2}
                    px={4}
                    borderRadius="6px"
                    border="1px solid"
                    borderColor={totalRawList.length > 0 ? ACCENT : "rgba(255,255,255,0.1)"}
                    bg={totalRawList.length > 0 ? `${ACCENT}18` : "transparent"}
                    color={totalRawList.length > 0 ? ACCENT : "whiteAlpha.300"}
                    cursor={totalRawList.length > 0 ? "pointer" : "default"}
                    fontSize="13px"
                    fontWeight="600"
                    _hover={totalRawList.length > 0 ? { bg: `${ACCENT}28` } : {}}
                    style={{ outline: "none" }}
                    onClick={() =>
                        totalRawList.length > 0 && startTransition(() => setShowModal(true))
                    }
                >
                    <LuShoppingBasket size={16} />
                    Ressources totales
                    {totalRawList.length > 0 && (
                        <Box
                            as="span"
                            display="inline-flex"
                            alignItems="center"
                            justifyContent="center"
                            bg={ACCENT}
                            color="#000"
                            borderRadius="full"
                            w="18px"
                            h="18px"
                            fontSize="10px"
                            fontWeight="800"
                            flexShrink={0}
                        >
                            {totalRawList.length}
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Modal */}
            <Dialog.Root open={showModal} onOpenChange={(d) => setShowModal(d.open)}>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content
                        bg="rgba(14,16,24,0.98)"
                        border={border}
                        borderRadius="10px"
                        maxW="460px"
                        w="90vw"
                        maxH="80vh"
                        display="flex"
                        flexDirection="column"
                    >
                        {/* Modal header */}
                        <Dialog.Header pb={2} flexShrink={0}>
                            <Dialog.Title color="white" fontSize="sm" fontWeight="700" flex={1}>
                                <HStack gap={2}>
                                    <LuShoppingBasket size={16} color={ACCENT} />
                                    <Text>Ressources totales</Text>
                                </HStack>
                            </Dialog.Title>
                            {/* Mode toggle */}
                            <HStack
                                gap={0}
                                bg="rgba(255,255,255,0.05)"
                                borderRadius="6px"
                                p="2px"
                                mr={2}
                            >
                                {(["qty", "price"] as const).map((mode) => (
                                    <Box
                                        key={mode}
                                        as="button"
                                        onClick={() => setModalMode(mode)}
                                        px={3}
                                        py="3px"
                                        borderRadius="4px"
                                        fontSize="11px"
                                        fontWeight="600"
                                        cursor="pointer"
                                        bg={modalMode === mode ? `${ACCENT}22` : "transparent"}
                                        color={modalMode === mode ? ACCENT : "whiteAlpha.500"}
                                        border="none"
                                        style={{ outline: "none" }}
                                    >
                                        {mode === "qty" ? "Quantités" : "Prix"}
                                    </Box>
                                ))}
                            </HStack>
                            <Dialog.CloseTrigger asChild>
                                <CloseButton
                                    size="sm"
                                    color="whiteAlpha.500"
                                    _hover={{ color: "white" }}
                                />
                            </Dialog.CloseTrigger>
                        </Dialog.Header>

                        {/* Modal body */}
                        <Dialog.Body overflowY="auto" pb={4} flex={1}>
                            {/* ── Quantités mode ── */}
                            {modalMode === "qty" && (
                                <VStack align="stretch" gap={1}>
                                    {totalRawList.map((res) => (
                                        <HStack
                                            key={`${res.iconId}-${res.name}`}
                                            px={2}
                                            py="6px"
                                            borderRadius="6px"
                                            _hover={{ bg: "rgba(255,255,255,0.04)" }}
                                            gap={2}
                                        >
                                            <ItemIcon iconId={res.iconId} size={20} />
                                            <Text
                                                fontSize="xs"
                                                color="white"
                                                flex={1}
                                                minW="0"
                                                truncate
                                            >
                                                {res.name}
                                            </Text>
                                            <Text
                                                fontSize="12px"
                                                color={ACCENT}
                                                fontWeight="700"
                                                flexShrink={0}
                                                fontFamily="mono"
                                            >
                                                ×{res.qty}
                                            </Text>
                                        </HStack>
                                    ))}
                                </VStack>
                            )}

                            {/* ── Prix mode ── */}
                            {modalMode === "price" && (
                                <VStack align="stretch" gap={0}>
                                    {/* Section A: Ressources brutes */}
                                    <SectionLabel>RESSOURCES BRUTES</SectionLabel>
                                    <VStack align="stretch" gap={1}>
                                        {totalRawList.map((res) => {
                                            const itemId = res.id;
                                            const unitPrice = getUnitPrice(itemId, prices);
                                            const totalCost = unitPrice * res.qty;
                                            const hasPrice = !!prices[String(itemId)]?.price;
                                            return (
                                                <Box
                                                    key={itemId}
                                                    px={2}
                                                    py={2}
                                                    borderRadius="6px"
                                                    border={border}
                                                    bg="rgba(255,255,255,0.02)"
                                                >
                                                    <HStack gap={2}>
                                                        <ItemIcon iconId={res.iconId} size={18} />
                                                        <Text
                                                            fontSize="xs"
                                                            color="white"
                                                            flex={1}
                                                            minW="0"
                                                            truncate
                                                        >
                                                            {res.name}
                                                        </Text>
                                                        <Text
                                                            fontSize="11px"
                                                            color="whiteAlpha.500"
                                                            flexShrink={0}
                                                        >
                                                            ×{res.qty}
                                                        </Text>
                                                        <Text
                                                            fontSize="11px"
                                                            fontWeight="700"
                                                            flexShrink={0}
                                                            fontFamily="mono"
                                                            color={
                                                                hasPrice ? ACCENT : "whiteAlpha.300"
                                                            }
                                                        >
                                                            {hasPrice
                                                                ? `= ${formatKamas(totalCost)}`
                                                                : "—"}
                                                        </Text>
                                                    </HStack>
                                                    <PriceRow
                                                        itemId={itemId}
                                                        prices={prices}
                                                        setPrice={setPrice}
                                                        required
                                                    />
                                                </Box>
                                            );
                                        })}
                                    </VStack>

                                    {/* Section B: Ingrédients craftables */}
                                    {craftableIntermediatesList.length > 0 && (
                                        <>
                                            <SectionLabel>INGRÉDIENTS CRAFTABLES</SectionLabel>
                                            <VStack align="stretch" gap={1}>
                                                {craftableIntermediatesList.map(([itemId, ci]) => {
                                                    const buyCost =
                                                        getUnitPrice(itemId, prices) * ci.qty;
                                                    const craftCost =
                                                        intermediateCraftCosts.get(itemId) ?? 0;
                                                    const hasPrice =
                                                        !!prices[String(itemId)]?.price;
                                                    const bothKnown = hasPrice && craftCost > 0;
                                                    let recommendation:
                                                        | "buy"
                                                        | "craft"
                                                        | "unknown" = "unknown";
                                                    if (bothKnown)
                                                        recommendation =
                                                            buyCost <= craftCost ? "buy" : "craft";
                                                    return (
                                                        <Box
                                                            key={itemId}
                                                            px={2}
                                                            py={2}
                                                            borderRadius="6px"
                                                            border={border}
                                                            bg="rgba(255,255,255,0.02)"
                                                        >
                                                            <HStack gap={2} flexWrap="wrap">
                                                                <ItemIcon
                                                                    iconId={ci.iconId}
                                                                    size={18}
                                                                />
                                                                <Text
                                                                    fontSize="xs"
                                                                    color="white"
                                                                    flex={1}
                                                                    minW="0"
                                                                    truncate
                                                                >
                                                                    {ci.name}
                                                                </Text>
                                                                <Text
                                                                    fontSize="11px"
                                                                    color="whiteAlpha.500"
                                                                    flexShrink={0}
                                                                >
                                                                    ×{ci.qty}
                                                                </Text>
                                                                <Badge
                                                                    fontSize="10px"
                                                                    px="6px"
                                                                    py="2px"
                                                                    borderRadius="4px"
                                                                    flexShrink={0}
                                                                    bg={
                                                                        recommendation === "buy"
                                                                            ? "rgba(33,150,243,0.2)"
                                                                            : recommendation ===
                                                                                "craft"
                                                                              ? "rgba(76,175,80,0.2)"
                                                                              : "rgba(255,255,255,0.06)"
                                                                    }
                                                                    color={
                                                                        recommendation === "buy"
                                                                            ? "#64b5f6"
                                                                            : recommendation ===
                                                                                "craft"
                                                                              ? "#81c784"
                                                                              : "whiteAlpha.400"
                                                                    }
                                                                >
                                                                    {recommendation === "buy"
                                                                        ? "Acheter"
                                                                        : recommendation === "craft"
                                                                          ? "Crafter"
                                                                          : "?"}
                                                                </Badge>
                                                            </HStack>
                                                            {(hasPrice || craftCost > 0) && (
                                                                <HStack
                                                                    gap={3}
                                                                    mt={1}
                                                                    flexWrap="wrap"
                                                                >
                                                                    {hasPrice && (
                                                                        <Text
                                                                            fontSize="10px"
                                                                            color="whiteAlpha.500"
                                                                        >
                                                                            Achat:{" "}
                                                                            <Text
                                                                                as="span"
                                                                                color="white"
                                                                                fontWeight="600"
                                                                            >
                                                                                {formatKamas(
                                                                                    buyCost,
                                                                                )}
                                                                            </Text>
                                                                        </Text>
                                                                    )}
                                                                    {craftCost > 0 && (
                                                                        <Text
                                                                            fontSize="10px"
                                                                            color="whiteAlpha.500"
                                                                        >
                                                                            Craft:{" "}
                                                                            <Text
                                                                                as="span"
                                                                                color="white"
                                                                                fontWeight="600"
                                                                            >
                                                                                {formatKamas(
                                                                                    craftCost,
                                                                                )}
                                                                            </Text>
                                                                        </Text>
                                                                    )}
                                                                </HStack>
                                                            )}
                                                            <PriceRow
                                                                itemId={itemId}
                                                                prices={prices}
                                                                setPrice={setPrice}
                                                            />
                                                        </Box>
                                                    );
                                                })}
                                            </VStack>
                                        </>
                                    )}

                                    {/* Section C: Articles craftés (sell prices) */}
                                    <SectionLabel>ARTICLES CRAFTÉS</SectionLabel>
                                    <VStack align="stretch" gap={1}>
                                        {entries.map((e) => {
                                            const qty = Math.max(
                                                1,
                                                parseInt(e.craftQty || "1", 10),
                                            );
                                            const sellUnitPrice = getUnitPrice(e.item.id, prices);
                                            const revenue = sellUnitPrice * qty;
                                            const hasPrice = !!prices[String(e.item.id)]?.price;
                                            return (
                                                <Box
                                                    key={e.item.id}
                                                    px={2}
                                                    py={2}
                                                    borderRadius="6px"
                                                    border={border}
                                                    bg="rgba(255,255,255,0.02)"
                                                >
                                                    <HStack gap={2}>
                                                        <ItemIcon
                                                            iconId={e.item.iconId}
                                                            size={18}
                                                        />
                                                        <Text
                                                            fontSize="xs"
                                                            color="white"
                                                            flex={1}
                                                            minW="0"
                                                            truncate
                                                        >
                                                            {e.item.name}
                                                        </Text>
                                                        <Text
                                                            fontSize="11px"
                                                            color="whiteAlpha.500"
                                                            flexShrink={0}
                                                        >
                                                            ×{qty}
                                                        </Text>
                                                        {hasPrice && (
                                                            <Text
                                                                fontSize="11px"
                                                                fontWeight="700"
                                                                flexShrink={0}
                                                                fontFamily="mono"
                                                                color="rgba(129,199,132,0.9)"
                                                            >
                                                                Vente: {formatKamas(revenue)}
                                                            </Text>
                                                        )}
                                                    </HStack>
                                                    <PriceRow
                                                        itemId={e.item.id}
                                                        prices={prices}
                                                        setPrice={setPrice}
                                                    />
                                                </Box>
                                            );
                                        })}
                                    </VStack>

                                    {/* Footer: totals */}
                                    <Box mt={4} pt={3} borderTop={border}>
                                        {!allRawPricesSet && (
                                            <Text
                                                fontSize="10px"
                                                color="rgba(255,80,80,0.8)"
                                                mb={2}
                                            >
                                                Certaines ressources brutes n'ont pas de prix.
                                            </Text>
                                        )}
                                        <HStack justify="space-between" flexWrap="wrap" gap={2}>
                                            <VStack gap={0} align="start">
                                                <Text
                                                    fontSize="10px"
                                                    color="whiteAlpha.400"
                                                    fontWeight="600"
                                                    letterSpacing="wider"
                                                >
                                                    COÛT
                                                </Text>
                                                <Text
                                                    fontSize="13px"
                                                    fontWeight="700"
                                                    fontFamily="mono"
                                                    color="whiteAlpha.700"
                                                >
                                                    {totalRawCost > 0
                                                        ? formatKamas(totalRawCost)
                                                        : "—"}
                                                </Text>
                                            </VStack>
                                            <VStack gap={0} align="start">
                                                <Text
                                                    fontSize="10px"
                                                    color="whiteAlpha.400"
                                                    fontWeight="600"
                                                    letterSpacing="wider"
                                                >
                                                    REVENUS
                                                </Text>
                                                <Text
                                                    fontSize="13px"
                                                    fontWeight="700"
                                                    fontFamily="mono"
                                                    color="rgba(129,199,132,0.9)"
                                                >
                                                    {totalRevenue > 0
                                                        ? formatKamas(totalRevenue)
                                                        : "—"}
                                                </Text>
                                            </VStack>
                                            <VStack gap={0} align="start">
                                                <Text
                                                    fontSize="10px"
                                                    color="whiteAlpha.400"
                                                    fontWeight="600"
                                                    letterSpacing="wider"
                                                >
                                                    MARGE
                                                </Text>
                                                <Text
                                                    fontSize="14px"
                                                    fontWeight="800"
                                                    fontFamily="mono"
                                                    color={
                                                        totalRawCost === 0 && totalRevenue === 0
                                                            ? "whiteAlpha.300"
                                                            : margin > 0
                                                              ? "#81c784"
                                                              : "#e57373"
                                                    }
                                                >
                                                    {totalRawCost === 0 && totalRevenue === 0
                                                        ? "—"
                                                        : `${margin >= 0 ? "+" : ""}${formatKamas(margin)}`}
                                                </Text>
                                            </VStack>
                                        </HStack>
                                    </Box>
                                </VStack>
                            )}
                        </Dialog.Body>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Dialog.Root>
        </Flex>
    );
}
