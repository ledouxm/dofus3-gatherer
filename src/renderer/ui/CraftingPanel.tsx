import { Badge, Box, CloseButton, Dialog, Flex, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { sql, type SqlBool } from "kysely";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { LuPackage, LuSearch, LuShoppingBasket, LuX } from "react-icons/lu";
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
    fontSize: "sm",
    color: "white",
    _placeholder: { color: "whiteAlpha.400" },
    _focus: { borderColor: "rgba(212,240,0,0.4)", outline: "none", boxShadow: "none" },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

type ItemRow = { id: number; iconId: number; level: number; typeId: number; name: string };

type RecipeIngredient = { id: number; iconId: number; name: string; quantity: number; subRecipe?: RecipeResult };
type RecipeResult = { jobName: string; resultLevel: number; ingredients: RecipeIngredient[] } | null;

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

    if (depth > 0) {
        const subRecipes = await Promise.all(ingredients.map((ing) => loadItemRecipe(ing.id, depth - 1)));
        ingredients.forEach((ing, idx) => { if (subRecipes[idx]) ing.subRecipe = subRecipes[idx]!; });
    }

    return { jobName: jobRow?.jobName ?? "", resultLevel: recipe.resultLevel, ingredients };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
            else acc.set(ing.id, { iconId: ing.iconId, name: ing.name, qty: ing.quantity * multiplier });
        }
    }
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
    if (!recipe) return null;
    return (
        <VStack align="stretch" gap={1}>
            {recipe.ingredients.map((sub) => (
                <Box key={sub.id}>
                    <HStack gap={2} py="2px">
                        <ItemIcon iconId={sub.iconId} size={14} />
                        <Text fontSize="10px" color="whiteAlpha.600" flex={1} minW="0" truncate>{sub.name}</Text>
                        <Text fontSize="10px" color="whiteAlpha.400" flexShrink={0}>×{sub.quantity * multiplier}</Text>
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
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const queryClient = useQueryClient();

    const [entries, setEntries] = useState<CraftEntry[]>([]);
    const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set());
    const toggleSub = (id: number) => setExpandedSubs((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const [showModal, setShowModal] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchResults, setSearchResults] = useState<ItemRow[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [focused, setFocused] = useState(false);
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

        setEntries((prev) =>
            prev.map((e) => (e.item.id === item.id ? { ...e, recipe } : e)),
        );
    };

    const updateCraftQty = (itemId: number, craftQty: string) => {
        setEntries((prev) => prev.map((e) => (e.item.id === itemId ? { ...e, craftQty } : e)));
    };

    const removeEntry = (itemId: number) => setEntries((prev) => prev.filter((e) => e.item.id !== itemId));

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
        () => [...totalRawMap.values()].sort((a, b) => b.qty - a.qty),
        [totalRawMap],
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
                        onFocus={() => { setFocused(true); if (searchResults.length > 0) setShowResults(true); }}
                        onBlur={() => { setFocused(false); setTimeout(() => setShowResults(false), 150); }}
                        placeholder="Rechercher un item à crafter…"
                        pl="32px"
                        size="sm"
                        {...inputStyle}
                    />
                </Box>

                {/* Dropdown: recents (empty input) or search results */}
                {(focused && !searchInput.trim() && craftingHistory.length > 0) || (showResults && searchResults.length > 0) ? (
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
                                    <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider">
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
                                        <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
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
                                    <ItemIcon iconId={entry.item.iconId} size={22} />
                                    <Text fontSize="sm" fontWeight="600" color="white" flex={1} truncate>
                                        {entry.item.name}
                                    </Text>
                                    <Input
                                        value={entry.craftQty}
                                        onChange={(e) => updateCraftQty(entry.item.id, e.target.value)}
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
                                                    const requiredQty = ing.quantity * craftQtyNum;
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
                                                                <ItemIcon iconId={ing.iconId} size={18} />
                                                                <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                                                    {ing.name}
                                                                </Text>
                                                                <Text fontSize="11px" color={ACCENT} fontWeight="600" flexShrink={0}>
                                                                    ×{requiredQty}
                                                                </Text>
                                                                {ing.subRecipe && (
                                                                    <Box
                                                                        as="button"
                                                                        onClick={() => toggleSub(ing.id)}
                                                                        fontSize="10px"
                                                                        color="whiteAlpha.400"
                                                                        _hover={{ color: "white" }}
                                                                        bg="transparent"
                                                                        border="none"
                                                                        cursor="pointer"
                                                                        flexShrink={0}
                                                                        style={{ outline: "none" }}
                                                                    >
                                                                        {expandedSubs.has(ing.id) ? "▲" : "▼"}
                                                                    </Box>
                                                                )}
                                                            </HStack>
                                                            {ing.subRecipe && expandedSubs.has(ing.id) && (
                                                                <Box mt={2} pl={2} borderLeft="2px solid rgba(255,255,255,0.08)">
                                                                    <SubRecipeTree
                                                                        recipe={ing.subRecipe}
                                                                        expandedSubs={expandedSubs}
                                                                        toggleSub={toggleSub}
                                                                        multiplier={craftQtyNum}
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
                    onClick={() => totalRawList.length > 0 && setShowModal(true)}
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

            {/* Total resources modal */}
            <Dialog.Root open={showModal} onOpenChange={(d) => setShowModal(d.open)}>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content
                        bg="rgba(14,16,24,0.98)"
                        border={border}
                        borderRadius="10px"
                        maxW="420px"
                        w="90vw"
                        maxH="70vh"
                        display="flex"
                        flexDirection="column"
                    >
                        <Dialog.Header pb={2} flexShrink={0}>
                            <Dialog.Title color="white" fontSize="sm" fontWeight="700">
                                <HStack gap={2}>
                                    <LuShoppingBasket size={16} color={ACCENT} />
                                    <Text>Ressources totales</Text>
                                    <Badge fontSize="10px" px="5px" bg={`${ACCENT}22`} color={ACCENT} borderRadius="4px">
                                        {totalRawList.length} types
                                    </Badge>
                                </HStack>
                            </Dialog.Title>
                            <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" color="whiteAlpha.500" _hover={{ color: "white" }} />
                            </Dialog.CloseTrigger>
                        </Dialog.Header>
                        <Dialog.Body overflowY="auto" pb={4}>
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
                                        <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                            {res.name}
                                        </Text>
                                        <Text fontSize="12px" color={ACCENT} fontWeight="700" flexShrink={0} fontFamily="mono">
                                            ×{res.qty}
                                        </Text>
                                    </HStack>
                                ))}
                            </VStack>
                        </Dialog.Body>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Dialog.Root>
        </Flex>
    );
}
