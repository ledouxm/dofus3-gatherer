import {
    Badge,
    Box,
    Button,
    Flex,
    Heading,
    IconButton,
    Stack,
    Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { LuCheck, LuCircle, LuCopy, LuDownload, LuSquare, LuUpload, LuVideo } from "react-icons/lu";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PacketTimeline, typeColor } from "./PacketTimeline";
import {
    type PacketEntry,
    type Recording,
    formatDuration,
    formatMs,
    usePacketRecorder,
} from "./usePacketRecorder";
import { VideoPlayer } from "./VideoPlayer";

type Source = Electron.DesktopCapturerSource;

/**
 * Packet Viewer window (loaded at hash #/viewer).
 *
 * Workflow:
 * 1. Pick a screen/window source from the dropdown.
 * 2. Click Record — captures screen + all decoded server packets.
 * 3. Click Stop — video + packets saved to main process.
 * 4. Replay: scrub the video, packet timeline highlights in sync.
 * 5. Click a packet row to inspect its JSON and copy the type name
 *    back into the Config modal.
 */
export const ViewerApp = () => {
    const [sources, setSources] = useState<Source[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string>("");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recording, setRecording] = useState<Recording | null>(null);
    const [currentMs, setCurrentMs] = useState(0);
    const [selectedPacket, setSelectedPacket] = useState<PacketEntry | null>(null);

    const { status, duration, start, stop, reset } = usePacketRecorder();

    // Load desktop sources on mount
    useEffect(() => {
        window.api.getDesktopSources().then((srcs) => {
            setSources(srcs);
            if (srcs.length > 0) setSelectedSourceId(srcs[0].id);
        });
    }, []);

    // Load existing recording from main process on mount (if user re-opens the window)
    useEffect(() => {
        window.api.getRecording().then((saved) => {
            if (saved && saved.packets.length > 0) {
                setRecording({
                    startTime: 0,
                    packets: saved.packets as PacketEntry[],
                    videoBuffer: saved.videoBuffer,
                });
            }
        });
    }, []);

    const handleRecord = useCallback(async () => {
        if (!selectedSourceId) return;
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                // @ts-expect-error — Electron-specific constraint
                mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: selectedSourceId,
                    maxWidth: 1920,
                    maxHeight: 1080,
                },
            },
        });
        setStream(mediaStream);
        setRecording(null);
        setSelectedPacket(null);
        reset();
        await start(mediaStream);
    }, [selectedSourceId, start, reset]);

    const handleStop = useCallback(async () => {
        const result = await stop();
        setRecording(result);
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setStream(null);
        }
    }, [stop, stream]);

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

    const handleLoad = useCallback(async () => {
        const data = await window.api.importRecording();
        if (!data) return;
        const videoBuffer = data.videoBase64
            ? Uint8Array.from(atob(data.videoBase64), (c) => c.charCodeAt(0)).buffer
            : null;
        setRecording({ startTime: 0, packets: data.packets as PacketEntry[], videoBuffer });
        setSelectedPacket(null);
    }, []);

    const isRecording = status === "recording";
    const isProcessing = status === "processing";

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

                {/* Source selector */}
                <Box
                    flex={1}
                    maxW="260px"
                >
                    <select
                        value={selectedSourceId}
                        onChange={(e) => setSelectedSourceId(e.target.value)}
                        disabled={isRecording}
                        style={{
                            width: "100%",
                            background: "rgba(255,255,255,0.05)",
                            color: "white",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            fontSize: "12px",
                            outline: "none",
                        }}
                    >
                        {sources.map((s) => (
                            <option key={s.id} value={s.id} style={{ background: "#1a1a2e" }}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </Box>

                {/* Record / Stop controls */}
                <Flex
                    align="center"
                    gap={2}
                >
                    {!isRecording ? (
                        <Button
                            size="xs"
                            colorScheme="red"
                            variant="solid"
                            onClick={handleRecord}
                            disabled={!selectedSourceId || isProcessing}
                            gap={1}
                        >
                            <LuCircle size={10} />
                            Record
                        </Button>
                    ) : (
                        <Button size="xs" colorScheme="gray" variant="solid" onClick={handleStop} gap={1}>
                            <LuSquare size={10} />
                            Stop
                        </Button>
                    )}

                    {isRecording && (
                        <Flex align="center" gap={1}>
                            <Box w="6px" h="6px" borderRadius="full" bg="red.400" animation="pulse 1s infinite" />
                            <Text fontSize="xs" fontFamily="mono" color="red.300">
                                {formatDuration(duration)}
                            </Text>
                        </Flex>
                    )}
                    {isProcessing && (
                        <Text fontSize="xs" color="whiteAlpha.500">
                            Processing...
                        </Text>
                    )}
                </Flex>

                {/* Packet count badge */}
                {recording && (
                    <Badge colorScheme="blue" fontSize="10px" css={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        {recording.packets.length} packets
                    </Badge>
                )}

                {/* Save / Load */}
                <Flex
                    align="center"
                    gap={2}
                >
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={handleSave}
                        disabled={!recording || isRecording || isProcessing}
                        gap={1}
                    >
                        <LuDownload size={10} />
                        Save
                    </Button>
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={handleLoad}
                        disabled={isRecording || isProcessing}
                        gap={1}
                    >
                        <LuUpload size={10} />
                        Load
                    </Button>
                </Flex>

                <Box flex={1} />
            </Flex>

            {/* Main content: resizable panels */}
            <Group style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                {/* Video panel */}
                <Panel defaultSize={55} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                    <Flex direction="column" p={3} gap={3} h="100%" overflow="hidden">
                        <VideoPlayer
                            videoBuffer={recording?.videoBuffer ?? null}
                            onTimeUpdate={setCurrentMs}
                        />
                        {!recording && !isRecording && (
                            <Stack gap={1} align="center" mt={2}>
                                <Text fontSize="xs" color="whiteAlpha.400" textAlign="center">
                                    Select a source above and click Record, then trigger a map change in Dofus.
                                    Stop recording to replay the session here.
                                </Text>
                            </Stack>
                        )}
                    </Flex>
                </Panel>

                <Separator style={{ width: "4px", cursor: "col-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

                {/* Right side: packet list + JSON detail */}
                <Panel defaultSize={45} minSize={20} style={{ display: "flex", overflow: "hidden" }}>
                    <Group orientation="vertical" style={{ flex: 1, overflow: "hidden" }}>
                        {/* Packet timeline */}
                        <Panel defaultSize={60} minSize={20} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <PacketTimeline
                                packets={recording?.packets ?? []}
                                currentMs={currentMs}
                                onSelect={setSelectedPacket}
                                selectedPacket={selectedPacket}
                            />
                        </Panel>

                        <Separator style={{ height: "4px", cursor: "row-resize", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

                        {/* JSON detail */}
                        <Panel defaultSize={40} minSize={10} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <JsonDetail packet={selectedPacket} />
                        </Panel>
                    </Group>
                </Panel>
            </Group>
        </Flex>
    );
};

// ── JSON detail panel ─────────────────────────────────────────────────────────

const JsonDetail = ({ packet }: { packet: PacketEntry | null }) => {
    const [copied, setCopied] = useState(false);

    if (!packet) {
        return (
            <Flex h="100%" align="center" justify="center">
                <Text fontSize="xs" color="whiteAlpha.400">Select a packet to inspect its JSON</Text>
            </Flex>
        );
    }

    const json = JSON.stringify(packet.data, null, 2);

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
                <Text fontSize="10px" color="whiteAlpha.400" fontFamily="mono">
                    @ {formatMs(packet.relativeMs)}
                </Text>
                <Box flex={1} />
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
