import { Badge, Box, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { sql, type SqlBool } from "kysely";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { LuPackage, LuSearch, LuX } from "react-icons/lu";
import { db } from "../db";
import { getItemIconUrl } from "../resources/ResourcesList";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCENT = "#d4f000";
const INACTIVE = "rgba(255,255,255,0.38)";
const border = "1px solid rgba(255,255,255,0.1)";
const panelBg = "rgba(10, 12, 18, 0.85)";
const inputStyle = {
    bg: "rgba(255,255,255,0.05)",
    border,
    borderRadius: "6px",
    fontSize: "sm",
    color: "white",
    _placeholder: { color: "whiteAlpha.400" },
    _focus: { borderColor: "rgba(212,240,0,0.4)", outline: "none", boxShadow: "none" },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

type PricePer = 1 | 10 | 100;

type ItemRow = { id: number; iconId: number; level: number; typeId: number; name: string };

type RecipeIngredient = { id: number; iconId: number; name: string; quantity: number };
type RecipeResult = { jobName: string; resultLevel: number; ingredients: RecipeIngredient[] } | null;

type IngredientInput = {
    id: number;
    buyQty: string;
    buyPrice: string;
    buyPricePer: PricePer;
};

type CraftEntry = {
    item: ItemRow;
    recipe: RecipeResult | "loading";
    craftQty: string;
    sellPrice: string;
    sellPricePer: PricePer;
    ingredients: IngredientInput[];
};

// ── DB queries ────────────────────────────────────────────────────────────────

async function searchItems(input: string): Promise<ItemRow[]> {
    const isId = /^\d+$/.test(input.trim());
    let query = db
        .selectFrom("ItemData as i")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(i.nameId AS TEXT)`)
        )
        .select([
            "i.id",
            "i.iconId",
            "i.level",
            "i.typeId",
            (eb) => eb.ref("t.value").as("name"),
        ])
        .where("t.lang", "=", "fr");

    if (isId) {
        query = query.where("i.id", "=", Number(input.trim()));
    } else {
        query = query.where("t.value", "like", `%${input.trim()}%`);
    }

    return query.orderBy("i.level", "asc").limit(30).execute() as Promise<ItemRow[]>;
}

async function loadItemRecipe(itemId: number): Promise<RecipeResult> {
    const recipe = await db
        .selectFrom("RecipeData as r")
        .select(["r.id", "r.jobId", "r.resultLevel", "r.quantities"])
        .where("r.resultId", "=", itemId)
        .executeTakeFirst();

    if (!recipe) return null;

    const jobRow = await db
        .selectFrom("JobData as j")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(j.nameId AS TEXT)`)
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
            join.on(sql<SqlBool>`t.id = CAST(i.nameId AS TEXT)`)
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
            return { id: item.id, iconId: item.iconId, name: item.name ?? "", quantity: quantities[idx] ?? 1 };
        })
        .filter((x): x is RecipeIngredient => x !== null);

    return { jobName: jobRow?.jobName ?? "", resultLevel: recipe.resultLevel, ingredients };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ItemIcon({ iconId, size = 24 }: { iconId: number; size?: number }) {
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

function PriceInput({
    price,
    onPriceChange,
    pricePer,
    onPricePerChange,
    placeholder = "prix",
}: {
    price: string;
    onPriceChange: (v: string) => void;
    pricePer: PricePer;
    onPricePerChange: (v: PricePer) => void;
    placeholder?: string;
}) {
    return (
        <HStack gap={1} flexShrink={0}>
            <Input
                value={price}
                onChange={(e) => onPriceChange(e.target.value)}
                placeholder={placeholder}
                size="xs"
                w="80px"
                type="number"
                min={0}
                {...inputStyle}
            />
            {([1, 10, 100] as PricePer[]).map((p) => (
                <Box
                    key={p}
                    as="button"
                    onClick={() => onPricePerChange(p)}
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
}

// ── Profit calculation ────────────────────────────────────────────────────────

function calcProfit(entries: CraftEntry[]): { totalRevenue: number; totalCost: number; profit: number } {
    let totalRevenue = 0;
    let totalCost = 0;

    for (const e of entries) {
        const qty = Math.max(0, parseInt(e.craftQty || "0", 10));
        const sell = parseFloat(e.sellPrice || "0");
        totalRevenue += qty * (sell / e.sellPricePer);

        for (const ing of e.ingredients) {
            const buyQty = Math.max(0, parseInt(ing.buyQty || "0", 10));
            const buyPrice = parseFloat(ing.buyPrice || "0");
            totalCost += buyQty * (buyPrice / ing.buyPricePer);
        }
    }

    return { totalRevenue, totalCost, profit: totalRevenue - totalCost };
}

function formatKamas(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "+";
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} M`;
    if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} k`;
    return `${sign}${Math.round(abs)}`;
}

// ── Saved entry shape (persisted to config, no recipe data) ──────────────────

type SavedEntry = {
    item: ItemRow;
    craftQty: string;
    sellPrice: string;
    sellPricePer: PricePer;
    ingredients: IngredientInput[];
};

// ── Main component ────────────────────────────────────────────────────────────

export function CraftingPanel() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const queryClient = useQueryClient();

    const [entries, setEntries] = useState<CraftEntry[]>([]);
    const [searchInput, setSearchInput] = useState("");
    const [debouncedInput, setDebouncedInput] = useState("");
    const [searchResults, setSearchResults] = useState<ItemRow[]>([]);
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const hasRestoredEntries = useRef(false);

    // Restore persisted entries on mount
    useEffect(() => {
        if (!config || hasRestoredEntries.current) return;
        hasRestoredEntries.current = true;
        const saved = config.harvests?.craftingEntries as SavedEntry[] | undefined;
        if (!saved || saved.length === 0) return;

        setEntries(saved.map((e) => ({ ...e, recipe: "loading" as const })));

        for (const e of saved) {
            queryClient
                .fetchQuery({
                    queryKey: ["explorer-item-recipe", e.item.id],
                    queryFn: () => loadItemRecipe(e.item.id),
                    staleTime: Infinity,
                })
                .then((recipe) => {
                    setEntries((prev) =>
                        prev.map((entry) =>
                            entry.item.id === e.item.id ? { ...entry, recipe } : entry,
                        ),
                    );
                });
        }
    }, [config]);

    // Auto-save entries to config (debounced, skip before restore)
    useDebounce(
        () => {
            if (!hasRestoredEntries.current) return;
            const toSave: SavedEntry[] = entries.map((e) => ({
                item: e.item,
                craftQty: e.craftQty,
                sellPrice: e.sellPrice,
                sellPricePer: e.sellPricePer,
                ingredients: e.ingredients,
            }));
            updateConfig.mutate({ harvests: { ...config?.harvests, craftingEntries: toSave } });
        },
        500,
        [entries],
    );

    useDebounce(
        () => {
            setDebouncedInput(searchInput);
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

        const newEntry: CraftEntry = {
            item,
            recipe: "loading",
            craftQty: "1",
            sellPrice: "",
            sellPricePer: 1,
            ingredients: [],
        };
        setEntries((prev) => [...prev, newEntry]);
        setShowResults(false);
        setSearchInput("");

        const newHistory = [item, ...craftingHistory.filter((h) => h.id !== item.id)].slice(0, 10);
        updateConfig.mutate({ harvests: { ...config?.harvests, craftingHistory: newHistory } });

        const recipe = await queryClient.fetchQuery({
            queryKey: ["explorer-item-recipe", item.id],
            queryFn: () => loadItemRecipe(item.id),
            staleTime: Infinity,
        });

        const ingredients: IngredientInput[] = recipe
            ? recipe.ingredients.map((ing) => ({
                  id: ing.id,
                  buyQty: String(ing.quantity),
                  buyPrice: "",
                  buyPricePer: 1 as PricePer,
              }))
            : [];

        setEntries((prev) =>
            prev.map((e) => (e.item.id === item.id ? { ...e, recipe, ingredients } : e)),
        );
    };

    const updateEntry = (itemId: number, patch: Partial<Pick<CraftEntry, "craftQty" | "sellPrice" | "sellPricePer">>) => {
        setEntries((prev) => prev.map((e) => (e.item.id === itemId ? { ...e, ...patch } : e)));
    };

    const updateIngredient = (itemId: number, ingId: number, patch: Partial<IngredientInput>) => {
        setEntries((prev) =>
            prev.map((e) =>
                e.item.id !== itemId
                    ? e
                    : { ...e, ingredients: e.ingredients.map((i) => (i.id === ingId ? { ...i, ...patch } : i)) },
            ),
        );
    };

    const removeEntry = (itemId: number) => setEntries((prev) => prev.filter((e) => e.item.id !== itemId));

    const { totalRevenue, totalCost, profit } = calcProfit(entries);

    const totalIngredientMap = useMemo(() => {
        const map = new Map<number, number>();
        for (const e of entries) {
            if (e.recipe === null || e.recipe === "loading") continue;
            const qty = Math.max(1, parseInt(e.craftQty || "1", 10));
            for (const ing of e.recipe.ingredients) {
                map.set(ing.id, (map.get(ing.id) ?? 0) + ing.quantity * qty);
            }
        }
        return map;
    }, [entries]);

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
                        onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                        onBlur={() => setTimeout(() => setShowResults(false), 150)}
                        placeholder="Rechercher un item à crafter…"
                        pl="32px"
                        size="sm"
                        {...inputStyle}
                    />
                </Box>

                {/* Search results dropdown */}
                {showResults && searchResults.length > 0 && (
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
                        {searchResults.map((item) => (
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
                        ))}
                    </Box>
                )}

                {/* History chips */}
                {!searchInput.trim() && craftingHistory.length > 0 && (
                    <HStack wrap="wrap" gap={1} mt={2}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" flexShrink={0}>
                            RÉCENTS
                        </Text>
                        {craftingHistory.map((h) => (
                            <Box
                                key={h.id}
                                as="button"
                                px={2}
                                py="2px"
                                fontSize="11px"
                                fontWeight="500"
                                borderRadius="4px"
                                border={border}
                                color="whiteAlpha.500"
                                bg="transparent"
                                cursor="pointer"
                                _hover={{ bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.900" }}
                                style={{ outline: "none" }}
                                onClick={() => addItem(h)}
                            >
                                {h.name}
                            </Box>
                        ))}
                    </HStack>
                )}

                {!searchInput.trim() && craftingHistory.length === 0 && (
                    <Text fontSize="xs" color="whiteAlpha.300" mt={2}>
                        Recherchez un item pour calculer le profit de craft.
                    </Text>
                )}
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
                                    <ItemIcon iconId={entry.item.iconId} size={22} />
                                    <Text fontSize="sm" fontWeight="600" color="white" flex={1} truncate>
                                        {entry.item.name}
                                    </Text>
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

                                {/* Craft qty + sell price */}
                                <HStack px={3} py={2} gap={4} flexWrap="wrap" borderBottom={border}>
                                    <HStack gap={2}>
                                        <Text fontSize="11px" color="whiteAlpha.500" flexShrink={0}>
                                            Qté craft
                                        </Text>
                                        <Input
                                            value={entry.craftQty}
                                            onChange={(e) => updateEntry(entry.item.id, { craftQty: e.target.value })}
                                            size="xs"
                                            w="60px"
                                            type="number"
                                            min={1}
                                            {...inputStyle}
                                        />
                                    </HStack>
                                    <HStack gap={2} flexWrap="wrap">
                                        <Text fontSize="11px" color="whiteAlpha.500" flexShrink={0}>
                                            Prix vente
                                        </Text>
                                        <PriceInput
                                            price={entry.sellPrice}
                                            onPriceChange={(v) => updateEntry(entry.item.id, { sellPrice: v })}
                                            pricePer={entry.sellPricePer}
                                            onPricePerChange={(v) => updateEntry(entry.item.id, { sellPricePer: v })}
                                        />
                                    </HStack>
                                </HStack>

                                {/* Ingredients */}
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
                                                <Text fontSize="10px" fontWeight="600" color="whiteAlpha.400" letterSpacing="0.08em">
                                                    INGRÉDIENTS
                                                </Text>
                                                <Badge fontSize="10px" px="5px" colorPalette="yellow" borderRadius="4px">
                                                    {entry.recipe.jobName}
                                                </Badge>
                                            </HStack>
                                            <VStack align="stretch" gap={2}>
                                                {entry.recipe.ingredients.map((ing) => {
                                                    const ingInput = entry.ingredients.find((i) => i.id === ing.id);
                                                    const requiredQty = ing.quantity * craftQtyNum;
                                                    const totalQty = totalIngredientMap.get(ing.id) ?? requiredQty;
                                                    if (!ingInput) return null;
                                                    return (
                                                        <Box
                                                            key={ing.id}
                                                            px={2}
                                                            py={2}
                                                            bg="rgba(255,255,255,0.02)"
                                                            borderRadius="6px"
                                                            border={border}
                                                        >
                                                            <HStack gap={2} mb={2}>
                                                                <ItemIcon iconId={ing.iconId} size={18} />
                                                                <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                                                    {ing.name}
                                                                </Text>
                                                                <HStack gap={2} flexShrink={0}>
                                                                    <Text fontSize="10px" color="whiteAlpha.500" fontWeight="600">
                                                                        ici: {requiredQty}
                                                                    </Text>
                                                                    <Text fontSize="10px" color={ACCENT} fontWeight="600">
                                                                        total: {totalQty}
                                                                    </Text>
                                                                </HStack>
                                                            </HStack>
                                                            <HStack gap={3} flexWrap="wrap">
                                                                <HStack gap={2}>
                                                                    <Text fontSize="10px" color="whiteAlpha.400" flexShrink={0}>
                                                                        Qté achat
                                                                    </Text>
                                                                    <Input
                                                                        value={ingInput.buyQty}
                                                                        onChange={(e) =>
                                                                            updateIngredient(entry.item.id, ing.id, { buyQty: e.target.value })
                                                                        }
                                                                        size="xs"
                                                                        w="60px"
                                                                        type="number"
                                                                        min={0}
                                                                        {...inputStyle}
                                                                    />
                                                                </HStack>
                                                                <HStack gap={2} flexWrap="wrap">
                                                                    <Text fontSize="10px" color="whiteAlpha.400" flexShrink={0}>
                                                                        Prix achat
                                                                    </Text>
                                                                    <PriceInput
                                                                        price={ingInput.buyPrice}
                                                                        onPriceChange={(v) =>
                                                                            updateIngredient(entry.item.id, ing.id, { buyPrice: v })
                                                                        }
                                                                        pricePer={ingInput.buyPricePer}
                                                                        onPricePerChange={(v) =>
                                                                            updateIngredient(entry.item.id, ing.id, { buyPricePer: v })
                                                                        }
                                                                    />
                                                                </HStack>
                                                            </HStack>
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
                            </Box>
                        );
                    })}
                </VStack>
            </Box>

            {/* Profit summary bar */}
            <Box
                flexShrink={0}
                borderTop={border}
                px={4}
                py={3}
                bg="rgba(10,12,18,0.95)"
            >
                <HStack justify="space-between" flexWrap="wrap" gap={3}>
                    <HStack gap={1}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="0.08em">
                            REVENUS
                        </Text>
                        <Text fontSize="12px" color={ACCENT} fontWeight="700" fontFamily="mono">
                            {formatKamas(totalRevenue)}
                        </Text>
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="0.08em">
                            COÛTS
                        </Text>
                        <Text fontSize="12px" color="whiteAlpha.600" fontWeight="700" fontFamily="mono">
                            {formatKamas(-totalCost)}
                        </Text>
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="0.08em">
                            BÉNÉFICE
                        </Text>
                        <Text
                            fontSize="13px"
                            fontWeight="800"
                            fontFamily="mono"
                            color={profit > 0 ? "#00e676" : profit < 0 ? "#ff5252" : "whiteAlpha.500"}
                        >
                            {formatKamas(profit)}
                        </Text>
                    </HStack>
                </HStack>
            </Box>
        </Flex>
    );
}
