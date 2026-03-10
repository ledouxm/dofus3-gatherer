import { Badge, Box, Button, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { sql, type SqlBool } from "kysely";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "react-use";
import {
    LuArrowLeft,
    LuCalendarDays,
    LuMap,
    LuPackage,
    LuScrollText,
    LuSearch,
    LuSwords,
    LuUsers,
} from "react-icons/lu";
import { db } from "../db";
import { getItemIconUrl } from "../resources/ResourcesList";
import { ClickableCoords } from "./ClickableCoords";
import { QuestsPanel } from "./QuestsPanel";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";

const panelBg = "rgba(10, 12, 18, 0.85)";
const border = "1px solid rgba(255,255,255,0.1)";
const ACCENT = "#d4f000";
const INACTIVE = "rgba(255,255,255,0.38)";
const inputStyle = {
    bg: "rgba(255,255,255,0.05)",
    border,
    borderRadius: "6px",
    fontSize: "sm",
    color: "white",
    _placeholder: { color: "whiteAlpha.400" },
    _focus: { borderColor: "rgba(212,240,0,0.4)", outline: "none", boxShadow: "none" },
};

type ExplorerSection = "donjons" | "quests" | "items" | "zones";

// ─── Quest queries ────────────────────────────────────────────────────────────

type QuestRow = {
    id: number;
    name: string;
    levelMin: number;
    levelMax: number;
    isEvent: number | null;
    isDungeonQuest: number | null;
    isPartyQuest: number | null;
};

async function searchQuests(input: string): Promise<QuestRow[]> {
    const isId = /^\d+$/.test(input.trim());
    let query = db
        .selectFrom("QuestData as q")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(q.nameId AS TEXT)`)
        )
        .select([
            "q.id",
            "q.levelMin",
            "q.levelMax",
            "q.isEvent",
            "q.isDungeonQuest",
            "q.isPartyQuest",
            (eb) => eb.ref("t.value").as("name"),
        ])
        .where("t.lang", "=", "fr");

    if (isId) {
        query = query.where("q.id", "=", Number(input.trim()));
    } else {
        query = query.where("t.value", "like", `%${input.trim()}%`);
    }

    return query.orderBy("q.levelMin", "asc").limit(30).execute() as Promise<QuestRow[]>;
}

type QuestStep = { id: number; name: string; optimalLevel: number };

async function loadQuestSteps(questId: number): Promise<QuestStep[]> {
    return db
        .selectFrom("QuestStepData as s")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(s.nameId AS TEXT)`)
        )
        .select(["s.id", "s.optimalLevel", (eb) => eb.ref("t.value").as("name")])
        .where("s.questId", "=", questId)
        .where("t.lang", "=", "fr")
        .orderBy("s.id", "asc")
        .execute() as Promise<QuestStep[]>;
}

// ─── Item queries ─────────────────────────────────────────────────────────────

type ItemRow = { id: number; iconId: number; level: number; typeId: number; name: string };

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

type ItemDetail = {
    id: number;
    iconId: number;
    level: number;
    typeId: number;
    description: string | null;
};

async function loadItemDetail(itemId: number): Promise<ItemDetail | null> {
    const row = await db
        .selectFrom("ItemData as i")
        .leftJoin("translations as tDesc", (join) =>
            join.on(sql<SqlBool>`tDesc.id = CAST(i.descriptionId AS TEXT)`)
        )
        .select([
            "i.id",
            "i.iconId",
            "i.level",
            "i.typeId",
            (eb) => eb.ref("tDesc.value").as("description"),
        ])
        .where("i.id", "=", itemId)
        .where((eb) =>
            eb.or([eb("tDesc.lang", "=", "fr"), eb("tDesc.lang", "is", null)])
        )
        .executeTakeFirst();
    return (row as ItemDetail | undefined) ?? null;
}

async function loadItemTypeName(typeId: number): Promise<string | null> {
    const result = await db.executeQuery(
        sql<{ name: string }>`
            SELECT t.value AS name
            FROM ItemTypeData it
            JOIN translations t ON t.id = CAST(it.nameId AS TEXT)
            WHERE it.id = ${typeId} AND t.lang = 'fr'
            LIMIT 1
        `.compile(db)
    );
    return result.rows[0]?.name ?? null;
}

type RecipeIngredient = {
    id: number;
    iconId: number;
    name: string;
    quantity: number;
};
type RecipeResult = {
    jobName: string;
    resultLevel: number;
    ingredients: RecipeIngredient[];
} | null;

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
        .selectFrom("RecipeDataIngredientIdsJunction as j")
        .select(["j.target_id"])
        .where("j.RecipeData_id", "=", Number(recipe.id))
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

// ─── Zone queries ─────────────────────────────────────────────────────────────

type SubAreaRow = {
    id: number;
    name: string;
    level: number;
    dungeonId: number;
    associatedZaapMapId: number;
};

async function searchSubAreas(input: string): Promise<SubAreaRow[]> {
    let query = db
        .selectFrom("SubAreaData as sa")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(sa.nameId AS TEXT)`)
        )
        .select([
            "sa.id",
            "sa.level",
            "sa.dungeonId",
            "sa.associatedZaapMapId",
            (eb) => eb.ref("t.value").as("name"),
        ])
        .where("t.lang", "=", "fr");

    if (input.trim()) {
        query = query.where("t.value", "like", `%${input.trim()}%`);
    }

    return query.orderBy("sa.level", "asc").limit(30).execute() as Promise<SubAreaRow[]>;
}

async function loadDungeonName(dungeonId: number): Promise<string | null> {
    const row = await db
        .selectFrom("DungeonData as d")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(d.nameId AS TEXT)`)
        )
        .select([(eb) => eb.ref("t.value").as("name")])
        .where("d.id", "=", dungeonId)
        .where("t.lang", "=", "fr")
        .executeTakeFirst();
    return row?.name ?? null;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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
        <Box
            as="img"
            src={getItemIconUrl(iconId)}
            w={`${size}px`}
            h={`${size}px`}
            objectFit="contain"
            borderRadius="4px"
            flexShrink={0}
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

function SearchInput({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    return (
        <Box position="relative" flexShrink={0}>
            <Box position="absolute" left="10px" top="50%" transform="translateY(-50%)" color="whiteAlpha.400" pointerEvents="none">
                <LuSearch size={14} />
            </Box>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                pl="32px"
                size="sm"
                {...inputStyle}
            />
        </Box>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <Box flex={1} display="flex" alignItems="center" justifyContent="center">
            <Text fontSize="xs" color="whiteAlpha.300">
                {text}
            </Text>
        </Box>
    );
}

// ─── Quest section ────────────────────────────────────────────────────────────

function QuestSearchSection() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [input, setInput] = useState("");
    const [debouncedInput, setDebouncedInput] = useState("");
    const [selectedQuest, setSelectedQuest] = useState<QuestRow | null>(null);

    useDebounce(() => setDebouncedInput(input), 200, [input]);

    const history = (config?.explorer?.questsHistory ?? []) as QuestRow[];

    const handleSelectQuest = (q: QuestRow) => {
        setSelectedQuest(q);
        const newHistory = [q, ...history.filter((h) => h.id !== q.id)].slice(0, 10);
        updateConfig.mutate({ explorer: { ...(config?.explorer ?? {}), questsHistory: newHistory } });
    };

    const { data: results = [], isFetching } = useQuery({
        queryKey: ["explorer-quests", debouncedInput],
        queryFn: () => (debouncedInput.trim() ? searchQuests(debouncedInput) : []),
        staleTime: 30_000,
    });

    const { data: steps = [] } = useQuery({
        queryKey: ["explorer-quest-steps", selectedQuest?.id],
        queryFn: () => loadQuestSteps(selectedQuest!.id),
        enabled: selectedQuest !== null,
        staleTime: Infinity,
    });

    if (selectedQuest) {
        return (
            <VStack flex={1} overflow="hidden" align="stretch" gap={0}>
                {/* Header */}
                <HStack px={3} py={2} borderBottom={border} gap={2} flexShrink={0}>
                    <Box
                        as="button"
                        onClick={() => setSelectedQuest(null)}
                        color="whiteAlpha.500"
                        _hover={{ color: "white" }}
                        bg="transparent"
                        border="none"
                        cursor="pointer"
                        display="flex"
                        alignItems="center"
                        p={0}
                    >
                        <LuArrowLeft size={14} />
                    </Box>
                    <Text fontSize="sm" fontWeight="600" color="white" flex={1} truncate>
                        {selectedQuest.name}
                    </Text>
                </HStack>

                {/* Meta */}
                <HStack px={3} py={2} gap={2} flexShrink={0} flexWrap="wrap">
                    <LevelBadge level={selectedQuest.levelMin} />
                    {selectedQuest.levelMax > selectedQuest.levelMin && (
                        <Text fontSize="10px" color="whiteAlpha.400">→ {selectedQuest.levelMax}</Text>
                    )}
                    {selectedQuest.isEvent === 1 && (
                        <Badge fontSize="10px" px="5px" py="1px" colorPalette="orange" borderRadius="4px">
                            <LuCalendarDays size={10} /> ÉVÈN.
                        </Badge>
                    )}
                    {selectedQuest.isDungeonQuest === 1 && (
                        <Badge fontSize="10px" px="5px" py="1px" colorPalette="blue" borderRadius="4px">
                            <LuSwords size={10} /> DONJON
                        </Badge>
                    )}
                    {selectedQuest.isPartyQuest === 1 && (
                        <Badge fontSize="10px" px="5px" py="1px" colorPalette="purple" borderRadius="4px">
                            <LuUsers size={10} /> GROUPE
                        </Badge>
                    )}
                </HStack>

                {/* Steps */}
                <Box flex={1} overflowY="auto" px={3} pb={3}>
                    <Text fontSize="10px" fontWeight="600" color="whiteAlpha.400" mb={2} letterSpacing="0.08em">
                        ÉTAPES ({steps.length})
                    </Text>
                    <VStack align="stretch" gap={1}>
                        {steps.map((step, idx) => (
                            <HStack
                                key={step.id}
                                px={3}
                                py={2}
                                bg="rgba(255,255,255,0.03)"
                                borderRadius="6px"
                                gap={2}
                                border={border}
                            >
                                <Text fontSize="10px" color="whiteAlpha.300" w="16px" flexShrink={0}>
                                    {idx + 1}
                                </Text>
                                <Text fontSize="xs" color="white" flex={1}>
                                    {step.name}
                                </Text>
                                {step.optimalLevel > 0 && <LevelBadge level={step.optimalLevel} />}
                            </HStack>
                        ))}
                        {steps.length === 0 && (
                            <Text fontSize="xs" color="whiteAlpha.300">Aucune étape trouvée.</Text>
                        )}
                    </VStack>
                </Box>
            </VStack>
        );
    }

    return (
        <VStack flex={1} overflow="hidden" align="stretch" gap={0} px={3} py={3}>
            <SearchInput value={input} onChange={setInput} placeholder="Nom ou ID de quête…" />
            <Box flex={1} overflowY="auto" mt={2}>
                {!debouncedInput.trim() && history.length > 0 && (
                    <Box mb={3}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" mb={2}>
                            RÉCENTS
                        </Text>
                        <HStack wrap="wrap" gap={1}>
                            {history.map((h) => (
                                <Button
                                    key={h.id}
                                    size="xs"
                                    variant="outline"
                                    borderColor="rgba(255,255,255,0.1)"
                                    color="whiteAlpha.500"
                                    bg="transparent"
                                    _hover={{ bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.900", borderColor: "rgba(255,255,255,0.2)" }}
                                    onClick={() => handleSelectQuest(h)}
                                >
                                    {h.name}
                                </Button>
                            ))}
                        </HStack>
                    </Box>
                )}
                {!debouncedInput.trim() && history.length === 0 && (
                    <EmptyState text="Recherchez une quête par nom ou par ID numérique." />
                )}
                {debouncedInput.trim() && !isFetching && results.length === 0 && (
                    <EmptyState text="Aucun résultat." />
                )}
                <VStack align="stretch" gap={1}>
                    {results.map((q) => (
                        <HStack
                            key={q.id}
                            px={3}
                            py={2}
                            bg="rgba(255,255,255,0.03)"
                            borderRadius="6px"
                            border={border}
                            cursor="pointer"
                            _hover={{ bg: "rgba(255,255,255,0.07)" }}
                            onClick={() => handleSelectQuest(q)}
                            gap={2}
                            flexWrap="wrap"
                        >
                            <LuScrollText size={12} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0 }} />
                            <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                {q.name}
                            </Text>
                            <HStack gap={1} flexShrink={0}>
                                <LevelBadge level={q.levelMin} />
                                {q.isEvent === 1 && (
                                    <Badge fontSize="9px" px="4px" colorPalette="orange" borderRadius="3px">
                                        ÉVÈN.
                                    </Badge>
                                )}
                                {q.isDungeonQuest === 1 && (
                                    <Badge fontSize="9px" px="4px" colorPalette="blue" borderRadius="3px">
                                        DONJON
                                    </Badge>
                                )}
                                {q.isPartyQuest === 1 && (
                                    <Badge fontSize="9px" px="4px" colorPalette="purple" borderRadius="3px">
                                        GROUPE
                                    </Badge>
                                )}
                            </HStack>
                        </HStack>
                    ))}
                </VStack>
            </Box>
        </VStack>
    );
}

// ─── Item section ─────────────────────────────────────────────────────────────

function ItemSearchSection() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [input, setInput] = useState("");
    const [debouncedInput, setDebouncedInput] = useState("");
    const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);

    useDebounce(() => setDebouncedInput(input), 200, [input]);

    const history = (config?.explorer?.itemsHistory ?? []) as ItemRow[];

    const handleSelectItem = (item: ItemRow) => {
        setSelectedItem(item);
        const newHistory = [item, ...history.filter((h) => h.id !== item.id)].slice(0, 10);
        updateConfig.mutate({ explorer: { ...(config?.explorer ?? {}), itemsHistory: newHistory } });
    };

    const { data: results = [], isFetching } = useQuery({
        queryKey: ["explorer-items", debouncedInput],
        queryFn: () => (debouncedInput.trim() ? searchItems(debouncedInput) : []),
        staleTime: 30_000,
    });

    const { data: detail } = useQuery({
        queryKey: ["explorer-item-detail", selectedItem?.id],
        queryFn: () => loadItemDetail(selectedItem!.id),
        enabled: selectedItem !== null,
        staleTime: Infinity,
    });

    const { data: typeName } = useQuery({
        queryKey: ["explorer-item-type", selectedItem?.typeId],
        queryFn: () => loadItemTypeName(selectedItem!.typeId),
        enabled: selectedItem !== null,
        staleTime: Infinity,
    });

    const { data: recipe } = useQuery({
        queryKey: ["explorer-item-recipe", selectedItem?.id],
        queryFn: () => loadItemRecipe(selectedItem!.id),
        enabled: selectedItem !== null,
        staleTime: Infinity,
    });

    if (selectedItem) {
        return (
            <VStack flex={1} overflow="hidden" align="stretch" gap={0}>
                {/* Header */}
                <HStack px={3} py={2} borderBottom={border} gap={2} flexShrink={0}>
                    <Box
                        as="button"
                        onClick={() => setSelectedItem(null)}
                        color="whiteAlpha.500"
                        _hover={{ color: "white" }}
                        bg="transparent"
                        border="none"
                        cursor="pointer"
                        display="flex"
                        alignItems="center"
                        p={0}
                    >
                        <LuArrowLeft size={14} />
                    </Box>
                    <ItemIcon iconId={selectedItem.iconId} size={24} />
                    <Text fontSize="sm" fontWeight="600" color="white" flex={1} truncate>
                        {selectedItem.name}
                    </Text>
                </HStack>

                {/* Body */}
                <Box flex={1} overflowY="auto" px={3} py={3}>
                    <HStack gap={2} mb={3} flexWrap="wrap">
                        <LevelBadge level={selectedItem.level} />
                        {typeName && (
                            <Badge fontSize="10px" px="5px" py="1px" bg="rgba(255,255,255,0.08)" color="whiteAlpha.600" borderRadius="4px">
                                {typeName}
                            </Badge>
                        )}
                        <Text fontSize="10px" color="whiteAlpha.300">ID: {selectedItem.id}</Text>
                    </HStack>

                    {detail?.description && (
                        <Text fontSize="xs" color="whiteAlpha.500" mb={3} lineHeight={1.5}>
                            {detail.description}
                        </Text>
                    )}

                    {/* Recipe */}
                    {recipe && (
                        <Box>
                            <HStack mb={2} gap={2}>
                                <Text fontSize="10px" fontWeight="600" color="whiteAlpha.400" letterSpacing="0.08em">
                                    RECETTE
                                </Text>
                                <Badge fontSize="10px" px="5px" colorPalette="yellow" borderRadius="4px">
                                    {recipe.jobName}
                                </Badge>
                                {recipe.resultLevel > 0 && (
                                    <Text fontSize="10px" color="whiteAlpha.300">Niv. {recipe.resultLevel}</Text>
                                )}
                            </HStack>
                            <VStack align="stretch" gap={1}>
                                {recipe.ingredients.map((ing) => (
                                    <HStack key={ing.id} px={3} py={2} bg="rgba(255,255,255,0.03)" borderRadius="6px" border={border} gap={2}>
                                        <ItemIcon iconId={ing.iconId} size={20} />
                                        <Text fontSize="xs" color="white" flex={1}>
                                            {ing.name}
                                        </Text>
                                        <Text fontSize="xs" color={ACCENT} fontWeight="600" flexShrink={0}>
                                            ×{ing.quantity}
                                        </Text>
                                    </HStack>
                                ))}
                                {recipe.ingredients.length === 0 && (
                                    <Text fontSize="xs" color="whiteAlpha.300">Ingrédients non trouvés.</Text>
                                )}
                            </VStack>
                        </Box>
                    )}
                </Box>
            </VStack>
        );
    }

    return (
        <VStack flex={1} overflow="hidden" align="stretch" gap={0} px={3} py={3}>
            <SearchInput value={input} onChange={setInput} placeholder="Nom ou ID d'objet…" />
            <Box flex={1} overflowY="auto" mt={2}>
                {!debouncedInput.trim() && history.length > 0 && (
                    <Box mb={3}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" mb={2}>
                            RÉCENTS
                        </Text>
                        <HStack wrap="wrap" gap={1}>
                            {history.map((h) => (
                                <Button
                                    key={h.id}
                                    size="xs"
                                    variant="outline"
                                    borderColor="rgba(255,255,255,0.1)"
                                    color="whiteAlpha.500"
                                    bg="transparent"
                                    _hover={{ bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.900", borderColor: "rgba(255,255,255,0.2)" }}
                                    onClick={() => handleSelectItem(h)}
                                >
                                    {h.name}
                                </Button>
                            ))}
                        </HStack>
                    </Box>
                )}
                {!debouncedInput.trim() && history.length === 0 && (
                    <EmptyState text="Recherchez un objet par nom ou par ID numérique." />
                )}
                {debouncedInput.trim() && !isFetching && results.length === 0 && (
                    <EmptyState text="Aucun résultat." />
                )}
                <VStack align="stretch" gap={1}>
                    {results.map((item) => (
                        <HStack
                            key={item.id}
                            px={3}
                            py={2}
                            bg="rgba(255,255,255,0.03)"
                            borderRadius="6px"
                            border={border}
                            cursor="pointer"
                            _hover={{ bg: "rgba(255,255,255,0.07)" }}
                            onClick={() => handleSelectItem(item)}
                            gap={2}
                        >
                            <ItemIcon iconId={item.iconId} size={24} />
                            <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                {item.name}
                            </Text>
                            <LevelBadge level={item.level} />
                        </HStack>
                    ))}
                </VStack>
            </Box>
        </VStack>
    );
}

// ─── Zone section ─────────────────────────────────────────────────────────────

function ZoneExplorerSection() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [input, setInput] = useState("");
    const [debouncedInput, setDebouncedInput] = useState("");
    const [selected, setSelected] = useState<SubAreaRow | null>(null);

    useDebounce(() => setDebouncedInput(input), 200, [input]);

    const history = (config?.explorer?.zonesHistory ?? []) as SubAreaRow[];

    const handleSelectZone = (zone: SubAreaRow) => {
        setSelected(zone);
        const newHistory = [zone, ...history.filter((h) => h.id !== zone.id)].slice(0, 10);
        updateConfig.mutate({ explorer: { ...(config?.explorer ?? {}), zonesHistory: newHistory } });
    };

    const { data: results = [], isFetching } = useQuery({
        queryKey: ["explorer-zones", debouncedInput],
        queryFn: () => searchSubAreas(debouncedInput),
        staleTime: 30_000,
    });

    const { data: dungeonName } = useQuery({
        queryKey: ["explorer-dungeon-name", selected?.dungeonId],
        queryFn: () => loadDungeonName(selected!.dungeonId),
        enabled: selected !== null && selected.dungeonId !== 0,
        staleTime: Infinity,
    });

    if (selected) {
        return (
            <VStack flex={1} overflow="hidden" align="stretch" gap={0}>
                {/* Header */}
                <HStack px={3} py={2} borderBottom={border} gap={2} flexShrink={0}>
                    <Box
                        as="button"
                        onClick={() => setSelected(null)}
                        color="whiteAlpha.500"
                        _hover={{ color: "white" }}
                        bg="transparent"
                        border="none"
                        cursor="pointer"
                        display="flex"
                        alignItems="center"
                        p={0}
                    >
                        <LuArrowLeft size={14} />
                    </Box>
                    <LuMap size={14} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0 }} />
                    <Text fontSize="sm" fontWeight="600" color="white" flex={1} truncate>
                        {selected.name}
                    </Text>
                </HStack>

                <Box px={3} py={3} overflowY="auto" flex={1}>
                    <HStack gap={2} mb={3} flexWrap="wrap">
                        <LevelBadge level={selected.level} />
                        {selected.dungeonId !== 0 && (
                            <Badge fontSize="10px" px="5px" colorPalette="blue" borderRadius="4px">
                                <LuSwords size={10} /> DONJON
                            </Badge>
                        )}
                    </HStack>

                    {dungeonName && (
                        <Box mb={3}>
                            <Text fontSize="10px" color="whiteAlpha.400" mb={1} letterSpacing="0.08em">
                                DONJON
                            </Text>
                            <Text fontSize="xs" color="white">{dungeonName}</Text>
                        </Box>
                    )}

                    {selected.associatedZaapMapId !== 0 && (
                        <Box mb={3}>
                            <Text fontSize="10px" color="whiteAlpha.400" mb={1} letterSpacing="0.08em">
                                ZAAP
                            </Text>
                            <ClickableCoords mapId={selected.associatedZaapMapId} />
                        </Box>
                    )}

                    <Text fontSize="10px" color="whiteAlpha.300">ID zone: {selected.id}</Text>
                </Box>
            </VStack>
        );
    }

    return (
        <VStack flex={1} overflow="hidden" align="stretch" gap={0} px={3} py={3}>
            <SearchInput value={input} onChange={setInput} placeholder="Nom de zone…" />
            <Box flex={1} overflowY="auto" mt={2}>
                {!debouncedInput.trim() && history.length > 0 && results.length === 0 && (
                    <Box mb={3}>
                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" mb={2}>
                            RÉCENTS
                        </Text>
                        <HStack wrap="wrap" gap={1}>
                            {history.map((h) => (
                                <Button
                                    key={h.id}
                                    size="xs"
                                    variant="outline"
                                    borderColor="rgba(255,255,255,0.1)"
                                    color="whiteAlpha.500"
                                    bg="transparent"
                                    _hover={{ bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.900", borderColor: "rgba(255,255,255,0.2)" }}
                                    onClick={() => handleSelectZone(h)}
                                >
                                    {h.name}
                                </Button>
                            ))}
                        </HStack>
                    </Box>
                )}
                {!debouncedInput.trim() && history.length === 0 && results.length === 0 && (
                    <EmptyState text="Toutes les zones s'affichent ici. Tapez pour filtrer." />
                )}
                {debouncedInput.trim() && !isFetching && results.length === 0 && (
                    <EmptyState text="Aucun résultat." />
                )}
                <VStack align="stretch" gap={1}>
                    {results.map((zone) => (
                        <HStack
                            key={zone.id}
                            px={3}
                            py={2}
                            bg="rgba(255,255,255,0.03)"
                            borderRadius="6px"
                            border={border}
                            cursor="pointer"
                            _hover={{ bg: "rgba(255,255,255,0.07)" }}
                            onClick={() => handleSelectZone(zone)}
                            gap={2}
                        >
                            <LuMap size={12} color="rgba(255,255,255,0.35)" style={{ flexShrink: 0 }} />
                            <Text fontSize="xs" color="white" flex={1} minW="0" truncate>
                                {zone.name}
                            </Text>
                            <HStack gap={1} flexShrink={0}>
                                <LevelBadge level={zone.level} />
                                {zone.dungeonId !== 0 && (
                                    <Box color="rgba(100,160,255,0.7)" display="flex" alignItems="center">
                                        <LuSwords size={11} />
                                    </Box>
                                )}
                                {zone.associatedZaapMapId !== 0 && (
                                    <ClickableCoords mapId={zone.associatedZaapMapId} />
                                )}
                            </HStack>
                        </HStack>
                    ))}
                </VStack>
            </Box>
        </VStack>
    );
}

// ─── Root panel ───────────────────────────────────────────────────────────────

const SECTIONS: { id: ExplorerSection; label: string }[] = [
    { id: "donjons", label: "DONJONS" },
    { id: "quests", label: "QUÊTES" },
    { id: "items", label: "ITEMS" },
    { id: "zones", label: "ZONES" },
];

export function ExplorerPanel() {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [section, setSection] = useState<ExplorerSection>("donjons");
    const hasRestoredSection = useRef(false);

    useEffect(() => {
        if (!config || hasRestoredSection.current) return;
        hasRestoredSection.current = true;
        const saved = config.explorer?.section as ExplorerSection | undefined;
        if (saved) setSection(saved);
    }, [config]);

    const handleSectionChange = (s: ExplorerSection) => {
        setSection(s);
        updateConfig.mutate({ explorer: { section: s } });
    };

    return (
        <Box
            flex={1}
            display="flex"
            flexDirection="column"
            overflow="hidden"
            bg={panelBg}
        >
            {/* Section tab bar */}
            <HStack
                gap={0}
                borderBottom={border}
                flexShrink={0}
                bg="rgba(10, 12, 18, 0.6)"
            >
                {SECTIONS.map((s) => {
                    const isActive = section === s.id;
                    return (
                        <Box
                            key={s.id}
                            as="button"
                            onClick={() => handleSectionChange(s.id)}
                            px="14px"
                            h="32px"
                            fontSize="10px"
                            fontWeight="600"
                            letterSpacing="0.1em"
                            color={isActive ? ACCENT : INACTIVE}
                            bg="transparent"
                            border="none"
                            borderBottom={isActive ? `2px solid ${ACCENT}` : "2px solid transparent"}
                            cursor="pointer"
                            userSelect="none"
                            transition="color 0.15s, border-color 0.15s"
                            _hover={{ color: isActive ? ACCENT : "rgba(255,255,255,0.7)" }}
                            style={{ outline: "none", boxSizing: "border-box" }}
                        >
                            {s.label}
                        </Box>
                    );
                })}
            </HStack>

            {/* Section content */}
            <Box flex={1} overflow="hidden" display="flex" flexDirection="column">
                <Box
                    flex={1}
                    overflow="hidden"
                    display={section === "donjons" ? "flex" : "none"}
                    flexDirection="column"
                >
                    <QuestsPanel />
                </Box>
                <Box
                    flex={1}
                    overflow="hidden"
                    display={section === "quests" ? "flex" : "none"}
                    flexDirection="column"
                >
                    <QuestSearchSection />
                </Box>
                <Box
                    flex={1}
                    overflow="hidden"
                    display={section === "items" ? "flex" : "none"}
                    flexDirection="column"
                >
                    <ItemSearchSection />
                </Box>
                <Box
                    flex={1}
                    overflow="hidden"
                    display={section === "zones" ? "flex" : "none"}
                    flexDirection="column"
                >
                    <ZoneExplorerSection />
                </Box>
            </Box>
        </Box>
    );
}
