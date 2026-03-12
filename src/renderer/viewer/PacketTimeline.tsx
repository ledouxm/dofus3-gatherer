import { Badge, Box, Button, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import type { PacketEntry } from "./usePacketRecorder";
import { formatMs } from "./usePacketRecorder";
import { MapToConfigButton } from "./MapToConfigButton";

interface PacketTimelineProps {
    packets: PacketEntry[];
    currentMs?: number;
    onSelect: (packet: PacketEntry) => void;
    selectedPacket: PacketEntry | null;
    autoScrollToBottom?: boolean;
    recordingThresholdMs?: number | null;
    onClear?: () => void;
    /** Maps obfuscated typeName → friendly name for packets that have a known mapping */
    knownTypes?: Map<string, string>;
    /** Called when the user's scroll position changes between "at bottom" and "scrolled up" */
    onScrollStateChange?: (atBottom: boolean) => void;
}

const SYNC_WINDOW_MS = 500;

// Deterministic pastel color per type name (for the badge)
export function typeColor(typeName: string): string {
    const colors = ["blue", "green", "purple", "orange", "teal", "pink", "cyan", "yellow"];
    let hash = 0;
    for (let i = 0; i < typeName.length; i++) hash = (hash * 31 + typeName.charCodeAt(i)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
}

// Summarise the first few key=value pairs from packet data for the row preview
function dataPreview(data: Record<string, unknown>): string {
    return Object.entries(data)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("  ");
}

/**
 * Scrollable list of recorded packets.
 * - Filters by type name substring
 * - Highlights rows within ±500ms of the current video position
 * - Auto-scrolls to keep the active region in view
 * - Click a row to expand its full JSON in the detail panel below
 */
export const PacketTimeline = ({ packets, currentMs = -1, onSelect, selectedPacket, autoScrollToBottom, recordingThresholdMs, onClear, knownTypes, onScrollStateChange }: PacketTimelineProps) => {
    const [filter, setFilter] = useState("");
    const activeRowRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);
    const onScrollStateChangeRef = useRef(onScrollStateChange);
    onScrollStateChangeRef.current = onScrollStateChange;

    const filtered = filter
        ? packets.filter((p) => p.typeName.toLowerCase().includes(filter.toLowerCase()))
        : packets;

    // Track whether user is at the bottom
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const handleScroll = () => {
            const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 32;
            if (atBottom !== isAtBottomRef.current) {
                isAtBottomRef.current = atBottom;
                onScrollStateChangeRef.current?.(atBottom);
            }
        };
        list.addEventListener("scroll", handleScroll, { passive: true });
        return () => list.removeEventListener("scroll", handleScroll);
    }, []);

    // Auto-scroll to keep the nearest active packet visible (recording playback mode)
    useEffect(() => {
        if (autoScrollToBottom) return;
        if (activeRowRef.current && listRef.current) {
            const list = listRef.current;
            const row = activeRowRef.current;
            const rowTop = row.offsetTop;
            const rowBottom = rowTop + row.offsetHeight;
            if (rowBottom > list.scrollTop + list.clientHeight || rowTop < list.scrollTop) {
                list.scrollTop = rowTop - list.clientHeight / 2;
            }
        }
    }, [currentMs, autoScrollToBottom]);

    // Auto-scroll to bottom in live mode — only when already at bottom
    useEffect(() => {
        if (!autoScrollToBottom || !listRef.current || !isAtBottomRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [packets, autoScrollToBottom]);

    return (
        <Flex direction="column" h="100%" gap={0} overflow="hidden">
            {/* Filter */}
            <Flex p={2} gap={2} borderBottom="1px solid" borderColor="whiteAlpha.100" align="center">
                <Input
                    size="sm"
                    placeholder="Filter by packet type..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    bg="whiteAlpha.50"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    _focus={{ borderColor: "blue.400" }}
                    fontFamily="mono"
                    fontSize="xs"
                    flex={1}
                />
                {onClear && (
                    <Button
                        size="xs"
                        variant="ghost"
                        color="whiteAlpha.400"
                        _hover={{ color: "red.300", bg: "whiteAlpha.100" }}
                        flexShrink={0}
                        onClick={onClear}
                    >
                        Clear
                    </Button>
                )}
                <Text fontSize="9px" color="whiteAlpha.300" flexShrink={0} fontFamily="mono">
                    {packets.length}
                </Text>
            </Flex>

            {/* Packet rows */}
            <Box ref={listRef} flex={1} overflowY="auto" css={{ "&::-webkit-scrollbar": { width: "4px" }, "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "2px" } }}>
                {filtered.length === 0 && (
                    <Flex h="100%" align="center" justify="center">
                        <Text fontSize="xs" color="whiteAlpha.400">
                            {packets.length === 0 ? "No packets recorded" : "No matches"}
                        </Text>
                    </Flex>
                )}
                {filtered.map((packet, i) => {
                    const isActive = currentMs >= 0 && Math.abs(packet.relativeMs - currentMs) <= SYNC_WINDOW_MS;
                    const isRecording = recordingThresholdMs !== null && recordingThresholdMs !== undefined && packet.relativeMs >= recordingThresholdMs;
                    const isSelected = selectedPacket === packet;
                    const isFirst = i === 0 || !filtered[i - 1] || Math.abs(filtered[i - 1].relativeMs - currentMs) > SYNC_WINDOW_MS;
                    const ref = isActive && isFirst ? activeRowRef : undefined;
                    const friendlyName = knownTypes?.get(packet.typeName);

                    return (
                        <Flex
                            key={i}
                            ref={ref}
                            align="center"
                            gap={2}
                            px={3}
                            py="6px"
                            cursor="pointer"
                            bg={isSelected ? "blue.900" : friendlyName ? "rgba(212,240,0,0.04)" : isActive ? "whiteAlpha.100" : "transparent"}
                            borderLeft="2px solid"
                            borderLeftColor={isSelected ? "blue.400" : isRecording ? "orange.400" : friendlyName ? "#d4f000" : isActive ? "blue.400" : "transparent"}
                            _hover={{ bg: isSelected ? "blue.800" : "whiteAlpha.100" }}
                            onClick={() => onSelect(packet)}
                            transition="background 0.1s"
                        >
                            <Text fontFamily="mono" fontSize="10px" color="whiteAlpha.500" flexShrink={0} w="52px">
                                {formatMs(packet.relativeMs)}
                            </Text>
                            <Badge
                                colorScheme={typeColor(packet.typeName)}
                                fontSize="10px"
                                flexShrink={0}
                                px={1}
                                fontFamily="mono"
                            >
                                {packet.typeName}
                            </Badge>
                            {friendlyName && (
                                <Badge
                                    fontSize="8px"
                                    px="3px"
                                    py="1px"
                                    flexShrink={0}
                                    bg="rgba(212,240,0,0.15)"
                                    color="#d4f000"
                                    border="1px solid rgba(212,240,0,0.3)"
                                    fontFamily="mono"
                                >
                                    {friendlyName}
                                </Badge>
                            )}
                            {isRecording && (
                                <Badge fontSize="8px" colorScheme="orange" px="3px" py="1px" flexShrink={0}>
                                    REC
                                </Badge>
                            )}
                            <Text
                                fontSize="10px"
                                color="whiteAlpha.500"
                                fontFamily="mono"
                                overflow="hidden"
                                textOverflow="ellipsis"
                                whiteSpace="nowrap"
                                flex={1}
                            >
                                {dataPreview(packet.data as Record<string, unknown>)}
                            </Text>
                        </Flex>
                    );
                })}
            </Box>

            {/* Selected packet detail */}
            {selectedPacket && <PacketDetail packet={selectedPacket} />}
        </Flex>
    );
};

// ── Detail panel ──────────────────────────────────────────────────────────────

/** Shows the selected packet's type + fields, each with a copy-to-clipboard button. */
const PacketDetail = ({ packet }: { packet: PacketEntry }) => {
    const fields = Object.entries(packet.data as Record<string, unknown>);

    return (
        <Box
            borderTop="1px solid"
            borderColor="whiteAlpha.200"
            maxH="240px"
            overflowY="auto"
            bg="blackAlpha.500"
            css={{ "&::-webkit-scrollbar": { width: "4px" }, "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "2px" } }}
        >
            {/* Type name row */}
            <Flex
                align="center"
                gap={2}
                px={3}
                py="7px"
                borderBottom="1px solid"
                borderColor="whiteAlpha.100"
                bg="whiteAlpha.50"
            >
                <Badge colorScheme={typeColor(packet.typeName)} fontFamily="mono" fontSize="xs" flexShrink={0}>
                    {packet.typeName}
                </Badge>
                <Text fontSize="10px" color="whiteAlpha.400" fontFamily="mono">
                    @ {formatMs(packet.relativeMs)}
                </Text>
                <Box flex={1} />
                <CopyButton value={packet.typeName} />
                <MapToConfigButton value={packet.typeName} packetFields={Object.keys(packet.data as Record<string, unknown>)} />
            </Flex>

            {/* Field rows */}
            {fields.map(([key, value]) => (
                <Flex
                    key={key}
                    align="center"
                    gap={2}
                    px={3}
                    py="5px"
                    borderBottom="1px solid"
                    borderColor="whiteAlpha.50"
                    _hover={{ bg: "whiteAlpha.50" }}
                >
                    <Text fontFamily="mono" fontSize="10px" color="blue.300" flexShrink={0} minW="80px">
                        {key}
                    </Text>
                    <Text
                        fontFamily="mono"
                        fontSize="10px"
                        color="green.300"
                        flex={1}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                    >
                        {JSON.stringify(value)}
                    </Text>
                    <CopyButton value={key} />
                    <MapToConfigButton value={String(JSON.stringify(value))} />
                </Flex>
            ))}
        </Box>
    );
};

const CopyButton = ({ value }: { value: string }) => {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return (
        <IconButton
            aria-label="Copy"
            size="xs"
            variant="ghost"
            color={copied ? "green.400" : "whiteAlpha.500"}
            _hover={{ color: "white", bg: "whiteAlpha.100" }}
            h="18px"
            w="18px"
            minW="18px"
            flexShrink={0}
            onClick={copy}
        >
            {copied ? <LuCheck size={10} /> : <LuCopy size={10} />}
        </IconButton>
    );
};
