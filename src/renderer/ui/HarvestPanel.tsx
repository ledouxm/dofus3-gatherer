import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Box, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
} from "recharts";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { useResourcesQuery } from "../resources/useResourcesQuery";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCENT = "#d4f000";

const COLORS = [
    "#d4f000",
    "#4ecdc4",
    "#ff6b6b",
    "#a8dadc",
    "#f7b731",
    "#778ca3",
    "#a29bfe",
    "#fd79a8",
    "#00b894",
    "#e17055",
];
const colorFor = (i: number) => COLORS[i % COLORS.length];

type WindowKey = "1h" | "6h" | "12h" | "24h" | "3j" | "7j";

const WINDOWS: {
    key: WindowKey;
    label: string;
    hours: number;
    bucketMs: number;
    bucketFmt: (d: Date) => string;
}[] = [
    {
        key: "1h",
        label: "1h",
        hours: 1,
        bucketMs: 5 * 60_000,
        bucketFmt: (d) => d.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" }),
    },
    {
        key: "6h",
        label: "6h",
        hours: 6,
        bucketMs: 30 * 60_000,
        bucketFmt: (d) => d.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" }),
    },
    {
        key: "12h",
        label: "12h",
        hours: 12,
        bucketMs: 60 * 60_000,
        bucketFmt: (d) => d.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" }),
    },
    {
        key: "24h",
        label: "24h",
        hours: 24,
        bucketMs: 2 * 60 * 60_000,
        bucketFmt: (d) => d.toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" }),
    },
    {
        key: "3j",
        label: "3j",
        hours: 72,
        bucketMs: 6 * 60 * 60_000,
        bucketFmt: (d) =>
            `${d.toLocaleDateString("fr", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("fr", { hour: "2-digit" })}h`,
    },
    {
        key: "7j",
        label: "7j",
        hours: 168,
        bucketMs: 24 * 60 * 60_000,
        bucketFmt: (d) => d.toLocaleDateString("fr", { day: "2-digit", month: "2-digit" }),
    },
];

// ── Types ────────────────────────────────────────────────────────────────────

type HarvestEntry = {
    resourceId: number;
    quantity: number;
    mapId: number | null;
    timestamp: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export const HarvestPanel = () => {
    const [windowKey, setWindowKey] = useState<WindowKey>("6h");
    const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);

    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    const autoUpdate = config?.harvests?.autoUpdate ?? true;
    const setAutoUpdate = (val: boolean) =>
        updateConfig.mutate({ harvests: { ...config?.harvests, autoUpdate: val } });
    const win = WINDOWS.find((w) => w.key === windowKey)!;

    const { data: log = [] } = useQuery({
        queryKey: ["harvest-log"],
        queryFn: () => window.api.readHarvestLog(),
        refetchOnWindowFocus: true,
    });

    const { data: resources = [] } = useResourcesQuery();

    const resourceNameMap = useMemo(() => {
        const map = new Map<number, string>();
        for (const r of resources) {
            if (r.itemId != null) map.set(r.itemId, r.itemName);
        }
        return map;
    }, [resources]);

    const resName = (id: number) => resourceNameMap.get(id) ?? `#${id}`;

    // Entries within the selected time window
    const nowMs = Date.now();
    const fromMs = nowMs - win.hours * 3_600_000;

    const windowedLog = useMemo(
        () => log.filter((e) => new Date(e.timestamp).getTime() >= fromMs),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [log, windowKey],
    );

    const logResourceIds = useMemo(
        () => [...new Set(windowedLog.map((e) => e.resourceId))].sort((a, b) => a - b),
        [windowedLog],
    );

    const activeResourceIds = selectedResourceIds.length > 0 ? selectedResourceIds : logResourceIds;

    const filtered = useMemo(
        () => windowedLog.filter((e) => activeResourceIds.includes(e.resourceId)),
        [windowedLog, activeResourceIds],
    );

    // ── Chart data ────────────────────────────────────────────────────────────

    const chartData = useMemo(() => {
        const bucketMs = win.bucketMs;
        const bucketStart = Math.floor(fromMs / bucketMs) * bucketMs;
        const bucketEnd = Math.ceil(nowMs / bucketMs) * bucketMs;
        const buckets = new Map<number, Record<number, number>>();

        for (let t = bucketStart; t < bucketEnd; t += bucketMs) {
            buckets.set(t, {});
        }

        for (const e of filtered) {
            const t = new Date(e.timestamp).getTime();
            const bucket = Math.floor(t / bucketMs) * bucketMs;
            const row = buckets.get(bucket);
            if (!row) continue;
            row[e.resourceId] = (row[e.resourceId] ?? 0) + e.quantity;
        }

        return [...buckets.entries()].map(([ts, byRes]) => ({
            label: win.bucketFmt(new Date(ts)),
            ...byRes,
        }));
    }, [filtered, windowKey]);

    // ── Stats ─────────────────────────────────────────────────────────────────

    const totalQty = filtered.reduce((s, e) => s + e.quantity, 0);
    const uniqueCount = new Set(filtered.map((e) => e.resourceId)).size;

    // ── List (latest first) ───────────────────────────────────────────────────

    const listEntries = useMemo(
        () => [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        [filtered],
    );

    const PAGE_SIZE = 10;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Reset when filters/window change
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [windowKey, selectedResourceIds]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE);
            },
            { threshold: 0.1 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [listEntries]);

    const visibleEntries = listEntries.slice(0, visibleCount);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const toggleResource = (id: number) =>
        setSelectedResourceIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );

    const btnBase: React.CSSProperties = {
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "6px",
        color: "rgba(255,255,255,0.5)",
        padding: "2px 10px",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        outline: "none",
        transition: "all 0.15s",
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Flex flex={1} direction="column" p={4} gap={3} overflow="hidden" bg="rgba(10,12,18,0.92)">
            {/* Header row */}
            <Flex align="center" justify="space-between" flexShrink={0} gap={4}>
                <Heading size="sm" color="whiteAlpha.900" letterSpacing="0.1em">
                    RÉCOLTES
                </Heading>

                {/* Time window buttons */}
                <Flex gap={1} align="center">
                    {WINDOWS.map((w) => (
                        <button
                            key={w.key}
                            onClick={() => setWindowKey(w.key)}
                            style={{
                                ...btnBase,
                                borderColor:
                                    windowKey === w.key ? ACCENT : "rgba(255,255,255,0.15)",
                                color: windowKey === w.key ? ACCENT : "rgba(255,255,255,0.5)",
                                background: windowKey === w.key ? `${ACCENT}18` : "transparent",
                            }}
                        >
                            {w.label}
                        </button>
                    ))}
                </Flex>

                {/* Auto-update + stats */}
                <Flex align="center" gap={3}>
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: "pointer",
                            fontSize: "12px",
                            color: "rgba(255,255,255,0.5)",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={autoUpdate}
                            onChange={(e) => setAutoUpdate(e.target.checked)}
                            style={{ accentColor: ACCENT }}
                        />
                        Auto-update
                    </label>
                    <Badge colorPalette="yellow" variant="subtle" fontFamily="mono">
                        {totalQty} items
                    </Badge>
                    <Badge colorPalette="gray" variant="subtle" fontFamily="mono">
                        {uniqueCount} res.
                    </Badge>
                </Flex>
            </Flex>

            {/* Resource filter chips */}
            {logResourceIds.length > 0 && (
                <Flex gap={2} flexWrap="wrap" flexShrink={0}>
                    {logResourceIds.map((id, i) => {
                        const isActive =
                            selectedResourceIds.length === 0 || selectedResourceIds.includes(id);
                        return (
                            <Box
                                key={id}
                                as="button"
                                onClick={() => toggleResource(id)}
                                px={2}
                                py="2px"
                                borderRadius="full"
                                fontSize="11px"
                                fontWeight="600"
                                border="1px solid"
                                borderColor={isActive ? colorFor(i) : "whiteAlpha.200"}
                                color={isActive ? colorFor(i) : "whiteAlpha.400"}
                                bg={isActive ? `${colorFor(i)}18` : "transparent"}
                                cursor="pointer"
                                transition="all 0.15s"
                                style={{ outline: "none" }}
                            >
                                {resName(id)}
                            </Box>
                        );
                    })}
                    {selectedResourceIds.length > 0 && (
                        <Box
                            as="button"
                            onClick={() => setSelectedResourceIds([])}
                            px={2}
                            py="2px"
                            borderRadius="full"
                            fontSize="11px"
                            color="whiteAlpha.400"
                            border="1px solid"
                            borderColor="whiteAlpha.100"
                            cursor="pointer"
                            style={{ outline: "none" }}
                        >
                            clear
                        </Box>
                    )}
                </Flex>
            )}

            {/* Chart */}
            <Box flexShrink={0} h="220px">
                {filtered.length === 0 ? (
                    <Flex h="100%" align="center" justify="center">
                        <Text color="whiteAlpha.300" fontSize="sm">
                            Aucune récolte dans cette période. Commence à récolter pour voir les
                            stats ici !
                        </Text>
                    </Flex>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="label"
                                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "rgba(10,12,18,0.97)",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    borderRadius: "8px",
                                    color: "white",
                                    fontSize: "12px",
                                }}
                                labelStyle={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}
                                formatter={(value, name) => [value, resName(Number(name))]}
                            />
                            {activeResourceIds.map((id, i) => (
                                <Bar
                                    key={id}
                                    dataKey={String(id)}
                                    stackId="a"
                                    fill={colorFor(i)}
                                    radius={
                                        i === activeResourceIds.length - 1
                                            ? [3, 3, 0, 0]
                                            : [0, 0, 0, 0]
                                    }
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Box>

            {/* List view */}
            <Box
                flex={1}
                minH={0}
                overflowY="auto"
                border="1px solid rgba(255,255,255,0.07)"
                borderRadius="md"
            >
                {listEntries.length === 0 ? (
                    <Flex h="60px" align="center" justify="center">
                        <Text color="whiteAlpha.300" fontSize="sm">
                            No entries.
                        </Text>
                    </Flex>
                ) : (
                    <Stack gap={0}>
                        {visibleEntries.map((e, i) => {
                            const colorIdx = activeResourceIds.indexOf(e.resourceId);
                            const c = colorFor(colorIdx >= 0 ? colorIdx : 0);
                            const t = new Date(e.timestamp);
                            const timeStr = t.toLocaleTimeString("fr", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            });
                            const dateStr = t.toLocaleDateString("fr", {
                                day: "2-digit",
                                month: "2-digit",
                            });
                            return (
                                <Flex
                                    key={i}
                                    px={3}
                                    py="6px"
                                    align="center"
                                    justify="space-between"
                                    borderBottom="1px solid rgba(255,255,255,0.05)"
                                    _hover={{ bg: "rgba(255,255,255,0.03)" }}
                                >
                                    <Flex align="center" gap={2}>
                                        <Box
                                            w="6px"
                                            h="6px"
                                            borderRadius="full"
                                            bg={c}
                                            flexShrink={0}
                                        />
                                        <Text
                                            fontSize="12px"
                                            color="whiteAlpha.800"
                                            fontWeight="500"
                                        >
                                            {resName(e.resourceId)}
                                        </Text>
                                    </Flex>
                                    <Flex align="center" gap={4}>
                                        <Badge
                                            colorPalette="yellow"
                                            variant="subtle"
                                            fontFamily="mono"
                                            fontSize="11px"
                                        >
                                            +{e.quantity}
                                        </Badge>
                                        <Text
                                            fontSize="11px"
                                            color="whiteAlpha.400"
                                            fontFamily="mono"
                                        >
                                            {dateStr} {timeStr}
                                        </Text>
                                    </Flex>
                                </Flex>
                            );
                        })}
                        {visibleCount < listEntries.length && (
                            <div ref={sentinelRef} style={{ height: 1 }} />
                        )}
                    </Stack>
                )}
            </Box>
        </Flex>
    );
};
