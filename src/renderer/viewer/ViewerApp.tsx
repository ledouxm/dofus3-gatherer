import {
    Badge,
    Box,
    Button,
    Flex,
    Heading,
    IconButton,
} from "@chakra-ui/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuCheck, LuCopy, LuDownload, LuUpload, LuVideo } from "react-icons/lu";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PacketTimeline, typeColor } from "./PacketTimeline";
import { type PacketEntry, type Recording, formatMs, usePacketRecorder } from "./usePacketRecorder";
import { useMappings } from "../providers/ConfigProvider";
import { VideoPlayer } from "./VideoPlayer";
import { RecordingLibrary } from "./RecordingLibrary";
import { useLiveLog } from "./useLiveLog";

type RightPanelTab = "live" | "packets";

/**
 * Packet Viewer tab.
 *
 * Layout:
 * - Left sidebar: RecordingLibrary (record controls + saved recordings list)
 * - Center: Video player
 * - Right: Live log | Loaded recording timeline
 */
export const ViewerApp = () => {
    const [recording, setRecording] = useState<Recording | null>(null);
    const [activeFilename, setActiveFilename] = useState<string | null>(null);
    const [currentMs, setCurrentMs] = useState(0);
    const [selectedLivePacket, setSelectedLivePacket] = useState<PacketEntry | null>(null);
    const [selectedRecPacket, setSelectedRecPacket] = useState<PacketEntry | null>(null);
    const [rightTab, setRightTab] = useState<RightPanelTab>("live");

    const liveLogFrozenRef = useRef(false);
    const { status, duration, start, stop, reset, recordingStartTime } = usePacketRecorder();
    const { packets: livePackets, recordingThresholdMs, clear: clearLiveLog } = useLiveLog(500, recordingStartTime, liveLogFrozenRef);
    const mappings = useMappings();
    const knownTypes = useMemo(() => {
        const map = new Map<string, string>();
        if (!mappings) return map;
        for (const [friendlyName, obfTypeName] of Object.entries(mappings)) {
            if (!friendlyName.includes(".") && typeof obfTypeName === "string") {
                map.set(obfTypeName, friendlyName);
            }
        }
        return map;
    }, [mappings]);

    const handleLoad = useCallback((rec: Recording & { filename: string }) => {
        setRecording(rec);
        setActiveFilename(rec.filename);
        setSelectedRecPacket(null);
        setCurrentMs(0);
        setRightTab("packets");
    }, []);

    const handleSave = useCallback(async () => {
        if (!recording) return;
        let videoBase64: string | null = null;
        if (recording.videoBuffer) {
            const bytes = new Uint8Array(recording.videoBuffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192) {
                binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            videoBase64 = btoa(binary);
        }
        await window.api.exportRecording({ packets: recording.packets, videoBase64 });
    }, [recording]);

    const handleImport = useCallback(async () => {
        const data = await window.api.importRecording();
        if (!data) return;
        const videoBuffer = data.videoBase64
            ? Uint8Array.from(atob(data.videoBase64), (c) => c.charCodeAt(0)).buffer
            : null;
        setRecording({ startTime: 0, packets: data.packets as PacketEntry[], videoBuffer });
        setActiveFilename(null);
        setSelectedRecPacket(null);
        setRightTab("packets");
    }, []);

    return (
        <Flex direction="column" h="100vh" bg="gray.950" color="white" overflow="hidden">
            {/* Title bar / toolbar */}
            <Flex
                align="center"
                gap={3}
                px={4}
                py={2}
                bg="gray.900"
                borderBottom="1px solid"
                borderColor="whiteAlpha.100"
                flexShrink={0}
            >
                <Flex align="center" gap={2}>
                    <LuVideo size={16} color="var(--chakra-colors-blue-400)" />
                    <Heading size="xs" color="whiteAlpha.800">
                        Packet Viewer
                    </Heading>
                </Flex>

                {recording && (
                    <Badge colorScheme="blue" fontSize="10px" css={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        {recording.packets.length} packets
                    </Badge>
                )}

                <Box flex={1} />

                {/* Export / Import */}
                <Flex align="center" gap={2}>
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={handleSave}
                        disabled={!recording}
                        gap={1}
                    >
                        <LuDownload size={10} />
                        Export
                    </Button>
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={handleImport}
                        gap={1}
                    >
                        <LuUpload size={10} />
                        Import
                    </Button>
                </Flex>
            </Flex>

            {/* Main content: resizable panels */}
            <Group style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                {/* Library sidebar */}
                <Panel defaultSize={20} minSize={14} style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                    <RecordingLibrary
                        onLoad={handleLoad}
                        activeFilename={activeFilename}
                        status={status}
                        duration={duration}
                        start={start}
                        stop={stop}
                        reset={reset}
                    />
                </Panel>

                <Separator style={{ width: "4px", cursor: "col-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

                {/* Video panel */}
                <Panel defaultSize={42} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                    <Flex direction="column" p={3} gap={3} h="100%" overflow="hidden">
                        <VideoPlayer
                            videoBuffer={recording?.videoBuffer ?? null}
                            onTimeUpdate={setCurrentMs}
                        />
                    </Flex>
                </Panel>

                <Separator style={{ width: "4px", cursor: "col-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

                {/* Right side: tab toggle + live/packets */}
                <Panel defaultSize={38} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Tab bar */}
                    <Flex
                        flexShrink={0}
                        borderBottom="1px solid"
                        borderColor="whiteAlpha.100"
                        bg="gray.900"
                    >
                        {(["live", "packets"] as RightPanelTab[]).map((tab) => (
                            <Box
                                key={tab}
                                as="button"
                                px={3}
                                py="5px"
                                fontSize="10px"
                                fontWeight="semibold"
                                textTransform="uppercase"
                                letterSpacing="wider"
                                borderBottom="2px solid"
                                borderColor={rightTab === tab ? "purple.400" : "transparent"}
                                color={rightTab === tab ? "purple.300" : "whiteAlpha.400"}
                                _hover={{ color: "whiteAlpha.700" }}
                                onClick={() => setRightTab(tab)}
                                transition="color 0.1s"
                            >
                                {tab}
                            </Box>
                        ))}
                    </Flex>

                    {/* Panel content */}
                    {rightTab === "live" ? (
                        <Group orientation="vertical" style={{ flex: 1, overflow: "hidden" }}>
                            <Panel defaultSize={60} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <PacketTimeline
                                    packets={livePackets}
                                    onSelect={setSelectedLivePacket}
                                    selectedPacket={selectedLivePacket}
                                    autoScrollToBottom
                                    recordingThresholdMs={recordingThresholdMs}
                                    onClear={clearLiveLog}
                                    knownTypes={knownTypes}
                                    onScrollStateChange={(atBottom) => { liveLogFrozenRef.current = !atBottom; }}
                                />
                            </Panel>
                            <Separator style={{ height: "4px", cursor: "row-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                            <Panel defaultSize={40} minSize={10} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <JsonDetail packet={selectedLivePacket} />
                            </Panel>
                        </Group>
                    ) : (
                        <Group orientation="vertical" style={{ flex: 1, overflow: "hidden" }}>
                            <Panel defaultSize={60} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <PacketTimeline
                                    packets={recording?.packets ?? []}
                                    currentMs={currentMs}
                                    onSelect={setSelectedRecPacket}
                                    selectedPacket={selectedRecPacket}
                                    knownTypes={knownTypes}
                                />
                            </Panel>
                            <Separator style={{ height: "4px", cursor: "row-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                            <Panel defaultSize={40} minSize={10} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <JsonDetail packet={selectedRecPacket} />
                            </Panel>
                        </Group>
                    )}
                </Panel>
            </Group>
        </Flex>
    );
};

// ── JSON detail panel ─────────────────────────────────────────────────────────

function stripRaw(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripRaw);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([k]) => k !== "_raw")
                .map(([k, v]) => [k, stripRaw(v)]),
        );
    }
    return value;
}

const JsonDetail = ({ packet }: { packet: PacketEntry | null }) => {
    const [copied, setCopied] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    if (!packet) {
        return (
            <Flex h="100%" align="center" justify="center">
                <Box fontSize="xs" color="whiteAlpha.400">Select a packet to inspect its JSON</Box>
            </Flex>
        );
    }

    const data = showRaw ? packet.data : stripRaw(packet.data);
    const json = JSON.stringify(data, null, 2);

    const copy = () => {
        navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    return (
        <Flex direction="column" h="100%" overflow="hidden" bg="blackAlpha.400">
            {/* Header */}
            <Flex
                align="center"
                gap={2}
                px={3}
                py="6px"
                borderBottom="1px solid"
                borderColor="whiteAlpha.100"
                bg="whiteAlpha.50"
                flexShrink={0}
            >
                <Badge colorScheme={typeColor(packet.typeName)} fontFamily="mono" fontSize="10px" px={1}>
                    {packet.typeName}
                </Badge>
                <Box fontSize="10px" color="whiteAlpha.400" fontFamily="mono">
                    @ {formatMs(packet.relativeMs)}
                </Box>
                <Box flex={1} />
                <Box
                    as="button"
                    fontSize="9px"
                    fontFamily="mono"
                    px="5px"
                    py="2px"
                    borderRadius="sm"
                    border="1px solid"
                    borderColor={showRaw ? "orange.500" : "whiteAlpha.200"}
                    color={showRaw ? "orange.300" : "whiteAlpha.400"}
                    bg={showRaw ? "rgba(237,137,54,0.12)" : "transparent"}
                    _hover={{ borderColor: "orange.400", color: "orange.200" }}
                    onClick={() => setShowRaw((v) => !v)}
                    flexShrink={0}
                >
                    _raw
                </Box>
                <IconButton
                    aria-label="Copy JSON"
                    size="xs"
                    variant="ghost"
                    color={copied ? "green.400" : "whiteAlpha.500"}
                    _hover={{ color: "white", bg: "whiteAlpha.100" }}
                    h="18px"
                    w="18px"
                    minW="18px"
                    onClick={copy}
                >
                    {copied ? <LuCheck size={10} /> : <LuCopy size={10} />}
                </IconButton>
            </Flex>

            {/* JSON body */}
            <Box
                flex={1}
                overflowY="auto"
                p={3}
                css={{ "&::-webkit-scrollbar": { width: "4px" }, "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "2px" } }}
            >
                <pre style={{ fontFamily: "monospace", fontSize: "11px", color: "#68d391", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {json}
                </pre>
            </Box>
        </Flex>
    );
};
