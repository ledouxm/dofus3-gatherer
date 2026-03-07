import { Badge, Box, Button, HStack, Text, VStack, createListCollection } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { sql, type SqlBool } from "kysely";
import { useMemo, useRef, useState } from "react";
import { useDebounce } from "react-use";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { LuCalendarDays, LuScrollText, LuSwords } from "react-icons/lu";
import {
    ComboboxContent,
    ComboboxControl,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemText,
    ComboboxRoot,
} from "../../components/ui/combobox";
import { db } from "../db";
import { ClickableCoords } from "./ClickableCoords";
import { Tooltip } from "./tooltip";

const panelBg = "rgba(10, 12, 18, 0.85)";
const border = "1px solid rgba(255,255,255,0.1)";

// Ark UI combobox expects items to have a `value` field for identity tracking.
// We add it explicitly so key/highlight matching works correctly.
type DungeonItem = { value: string; id: number; name: string; level: number; entranceMapId: number };
type HistoryEntry = { id: number; name: string; level: number; entranceMapId: number };

async function searchDungeons(input: string): Promise<DungeonItem[]> {
    const rows = await db
        .selectFrom("DungeonData as d")
        .innerJoin("translations as t", (join) =>
            join.on(sql<SqlBool>`t.id = CAST(d.nameId AS TEXT)`)
        )
        .select((eb) => ["d.id", "d.optimalPlayerLevel", "d.entranceMapId", eb.ref("t.value").as("name")])
        .where("t.lang", "=", "fr")
        .where("t.value", "like", `%${input}%`)
        .limit(20)
        .execute();
    return rows.map((r) => ({
        value: String(r.id),
        id: r.id,
        name: r.name ?? "",
        level: r.optimalPlayerLevel,
        entranceMapId: r.entranceMapId,
    }));
}

async function loadQuests(dungeonId: number) {
    const result = await db.executeQuery(
        sql<{ id: number; isEvent: number | null; name: string }>`
            WITH dungeon_maps AS (
                SELECT target_id AS mapId FROM DungeonData_mapIds_junction WHERE DungeonData_id = ${dungeonId}
                UNION
                SELECT m.id AS mapId FROM MapInformationData m JOIN SubAreaData sa ON sa.id = m.subAreaId WHERE sa.dungeonId = ${dungeonId}
            ),
            dungeon_monster_ids AS (
                SELECT DISTINCT CAST(je.value AS INTEGER) AS id
                FROM SubAreaData sa, json_each(sa.monsters) je
                WHERE sa.dungeonId = ${dungeonId}
            ),
            variant_monster_ids AS (
                SELECT m2.id
                FROM MonsterData m2
                JOIN translations t2 ON t2.id = CAST(m2.nameId AS TEXT) AND t2.lang = 'fr'
                WHERE EXISTS (
                    SELECT 1 FROM MonsterData m1
                    JOIN translations t1 ON t1.id = CAST(m1.nameId AS TEXT) AND t1.lang = 'fr'
                    WHERE m1.id IN (SELECT id FROM dungeon_monster_ids)
                    AND t2.value LIKE '%' || t1.value || '%'
                )
            )
            SELECT DISTINCT q.id, q.isEvent, tq.value AS name
            FROM QuestData q
            JOIN translations tq ON tq.id = CAST(q.nameId AS TEXT)
            WHERE tq.lang = 'fr'
            AND q.id IN (
                SELECT qs.questId FROM QuestStepData qs WHERE qs.id IN (
                    SELECT stepId FROM QuestObjectiveFightMonstersOnMapData WHERE mapId IN (SELECT mapId FROM dungeon_maps)
                    UNION
                    SELECT stepId FROM QuestObjectiveFightMonsterData WHERE mapId IN (SELECT mapId FROM dungeon_maps)
                    UNION
                    SELECT stepId FROM QuestObjectiveMultiFightMonsterData WHERE mapId IN (SELECT mapId FROM dungeon_maps)
                    UNION
                    SELECT stepId FROM QuestObjectiveDiscoverMapData WHERE mapId IN (SELECT mapId FROM dungeon_maps)
                    UNION
                    SELECT stepId FROM QuestObjectiveGoToNpcData WHERE mapId IN (SELECT mapId FROM dungeon_maps)
                )
                UNION
                SELECT qs.questId FROM QuestStepData qs
                JOIN QuestObjectiveFightMonsterData obj ON obj.stepId = qs.id
                WHERE json_extract(obj.parameters, '$.dungeonOnly') = 1
                AND json_extract(obj.parameters, '$.parameter0') IN (SELECT id FROM variant_monster_ids)
                UNION
                SELECT qs.questId FROM QuestStepData qs
                JOIN QuestObjectiveMultiFightMonsterData obj ON obj.stepId = qs.id
                WHERE json_extract(obj.parameters, '$.dungeonOnly') = 1
                AND json_extract(obj.parameters, '$.parameter0') IN (SELECT id FROM variant_monster_ids)
            )
        `.compile(db)
    );
    return result.rows.map((r) => ({ id: r.id, name: r.name ?? "", isEvent: r.isEvent }));
}

export function QuestsPanel() {
    const [inputValue, setInputValue] = useState("");
    const [dungeonItems, setDungeonItems] = useState<DungeonItem[]>([]);
    const [selectedDungeon, setSelectedDungeon] = useState<DungeonItem | null>(null);
    const selectedNameRef = useRef<string | null>(null);

    const config = useConfig();
    const history: HistoryEntry[] = config?.quests?.history ?? [];
    const updateConfig = useUpdateConfigMutation();

    useDebounce(
        () => {
            if (selectedNameRef.current === inputValue) return;
            if (!inputValue.trim()) { setDungeonItems([]); return; }
            searchDungeons(inputValue).then(setDungeonItems);
        },
        200,
        [inputValue]
    );

    const questQuery = useQuery({
        queryKey: ["quests", selectedDungeon?.id],
        queryFn: () => loadQuests(selectedDungeon!.id),
        enabled: selectedDungeon !== null,
        staleTime: Infinity,
    });

    const questItems = useMemo(
        () => [...(questQuery.data ?? [])].sort((a, b) => (a.isEvent ?? 0) - (b.isEvent ?? 0)),
        [questQuery.data]
    );

    const dungeonCollection = useMemo(
        () =>
            createListCollection({
                items: dungeonItems,
                itemToValue: (d) => d.value,
                itemToString: (d) => d.name,
            }),
        [dungeonItems]
    );

    const handleSelectDungeon = (dungeon: DungeonItem) => {
        selectedNameRef.current = dungeon.name;
        setSelectedDungeon(dungeon);
        setInputValue(dungeon.name);
        setDungeonItems([]);

        const newHistory = [
            { id: dungeon.id, name: dungeon.name, level: dungeon.level, entranceMapId: dungeon.entranceMapId },
            ...history.filter((h) => h.id !== dungeon.id),
        ].slice(0, 10);
        updateConfig.mutate({ quests: { history: newHistory } });
    };

    const showHistory = !selectedDungeon && !inputValue.trim() && history.length > 0;
    const showEmptyPrompt = !selectedDungeon && !inputValue.trim() && history.length === 0;
    const eventCount = useMemo(() => questItems.filter((q) => q.isEvent === 1).length, [questItems]);

    return (
        <Box
            w="100%"
            h="100%"
            bg={panelBg}
            p={4}
            display="flex"
            flexDirection="column"
            gap={3}
            overflow="hidden"
        >
            {/* Search */}
            <Box flexShrink={0}>
                <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" mb={2}>
                    DONJON
                </Text>
                <ComboboxRoot<DungeonItem>
                    collection={dungeonCollection}
                    inputValue={inputValue}
                    onInputValueChange={(details) => {
                        const val = details.inputValue;
                        // Only clear selection when user types something non-empty and different.
                        // Ignore empty-string events fired by Ark UI when the collection empties after selection.
                        if (val && val !== selectedNameRef.current) {
                            selectedNameRef.current = null;
                            setSelectedDungeon(null);
                        }
                        setInputValue(val);
                    }}
                    onValueChange={(details) => {
                        const dungeon = details.items[0] as DungeonItem | undefined;
                        if (dungeon) {
                            handleSelectDungeon(dungeon);
                        } else if (details.value.length === 0) {
                            // X button clicked — clear everything
                            selectedNameRef.current = null;
                            setSelectedDungeon(null);
                            setInputValue("");
                            setDungeonItems([]);
                        }
                    }}
                >
                    <ComboboxControl clearable={!!inputValue}>
                        <ComboboxInput
                            placeholder="Rechercher un donjon…"
                            bg="rgba(255,255,255,0.05)"
                            border={border}
                            color="whiteAlpha.900"
                            fontSize="sm"
                            _placeholder={{ color: "whiteAlpha.400" }}
                            _focus={{ borderColor: "rgba(212,240,0,0.4)", outline: "none" }}
                        />
                    </ComboboxControl>
                    <ComboboxContent
                        portalled={false}
                        bg="rgba(15,18,28,0.98)"
                        border={border}
                        p={1}
                    >
                        {dungeonItems.map((d) => (
                            <ComboboxItem key={d.value} item={d} px={3} py="6px" borderRadius="md">
                                <ComboboxItemText flex={1} fontSize="sm" color="whiteAlpha.900">
                                    {d.name}
                                </ComboboxItemText>
                                <Text fontSize="xs" color="whiteAlpha.400" flexShrink={0}>
                                    Nv.&nbsp;{d.level}
                                </Text>
                            </ComboboxItem>
                        ))}
                    </ComboboxContent>
                </ComboboxRoot>
            </Box>

            {/* Empty prompt */}
            {showEmptyPrompt && (
                <VStack flex={1} justify="center" gap={3} color="whiteAlpha.300">
                    <LuSwords size={28} />
                    <Text fontSize="xs" textAlign="center" maxW="160px" lineHeight="1.6">
                        Recherchez un donjon pour afficher ses quêtes associées.
                    </Text>
                </VStack>
            )}

            {/* History */}
            {showHistory && (
                <Box flexShrink={0}>
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
                                onClick={() => handleSelectDungeon({ value: String(h.id), ...h })}
                            >
                                {h.name}
                            </Button>
                        ))}
                    </HStack>
                </Box>
            )}

            {/* Quest list */}
            {selectedDungeon && (
                <>
                    <Box borderTop={border} pt={3} flexShrink={0}>
                        <HStack justify="space-between" align="baseline">
                            <HStack gap={2} align="center">
                                <Text fontSize="sm" color="whiteAlpha.900" fontWeight="semibold">
                                    {selectedDungeon.name}
                                </Text>
                                <Text fontSize="xs" color="whiteAlpha.400">
                                    Nv.&nbsp;{selectedDungeon.level}
                                </Text>
                                <ClickableCoords mapId={selectedDungeon.entranceMapId} />
                            </HStack>
                            {!questQuery.isLoading && questItems.length > 0 && (
                                <HStack gap={1.5}>
                                    <Badge
                                        fontSize="9px"
                                        px={1.5}
                                        py={0.5}
                                        borderRadius="sm"
                                        bg="rgba(255,255,255,0.06)"
                                        color="whiteAlpha.500"
                                        fontWeight="600"
                                        letterSpacing="wider"
                                    >
                                        {questItems.length} QUÊTE{questItems.length > 1 ? "S" : ""}
                                    </Badge>
                                    {eventCount > 0 && (
                                        <Badge
                                            fontSize="9px"
                                            px={1.5}
                                            py={0.5}
                                            borderRadius="sm"
                                            bg="rgba(249,115,22,0.15)"
                                            color="#f97316"
                                            fontWeight="600"
                                            letterSpacing="wider"
                                        >
                                            {eventCount} ÉVÈN.
                                        </Badge>
                                    )}
                                </HStack>
                            )}
                        </HStack>

                        <Text fontSize="10px" color="whiteAlpha.400" fontWeight="600" letterSpacing="wider" mt={3} mb={1}>
                            QUÊTES
                        </Text>
                    </Box>

                    <VStack gap={0} flex={1} overflow="auto" alignItems="stretch">
                        {questQuery.isLoading && (
                            <Text fontSize="xs" color="whiteAlpha.400" mt={1}>
                                Chargement…
                            </Text>
                        )}
                        {!questQuery.isLoading && questItems.length === 0 && (
                            <HStack gap={2} mt={1} color="whiteAlpha.400">
                                <LuScrollText size={12} />
                                <Text fontSize="xs">Aucune quête trouvée pour ce donjon.</Text>
                            </HStack>
                        )}
                        {questItems.map((q) => (
                            <HStack
                                key={q.id}
                                px={2}
                                py="6px"
                                borderRadius="md"
                                _hover={{ bg: "rgba(255,255,255,0.04)" }}
                            >
                                {q.isEvent === 1 && (
                                    <Tooltip content="Quête évènement">
                                        <Box as="span" lineHeight={0} flexShrink={0}>
                                            <LuCalendarDays size={14} color="#f97316" style={{ display: "block" }} />
                                        </Box>
                                    </Tooltip>
                                )}
                                <Text fontSize="sm" color="whiteAlpha.700" flex={1}>
                                    {q.name}
                                </Text>
                            </HStack>
                        ))}
                    </VStack>
                </>
            )}
        </Box>
    );
}
