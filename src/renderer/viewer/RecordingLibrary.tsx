import { Badge, Box, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    LuChevronDown,
    LuChevronUp,
    LuCircle,
    LuSquare,
    LuStar,
    LuTrash2,
} from "react-icons/lu";
import type { PacketEntry, RecordingMeta } from "./usePacketRecorder";
import {
    formatDuration,
    formatDurationMs,
    type Recording,
    usePacketRecorder,
} from "./usePacketRecorder";
import { useRecordings } from "./useRecordings";

type Source = Electron.DesktopCapturerSource;

interface RecordingLibraryProps {
    onLoad: (recording: Recording & { filename: string }) => void;
    activeFilename: string | null;
}

export const RecordingLibrary = ({ onLoad, activeFilename }: RecordingLibraryProps) => {
    const [sources, setSources] = useState<Source[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string>("");
    const [stream, setStream] = useState<MediaStream | null>(null);

    const { status, duration, start, stop, reset } = usePacketRecorder();
    const { sorted, loading, refresh, toggleFavorite, moveFavoriteUp, moveFavoriteDown, deleteRecording, renameRecording } = useRecordings();

    const isRecording = status === "recording";
    const isProcessing = status === "processing";

    useEffect(() => {
        window.api.getDesktopSources().then((srcs) => {
            setSources(srcs);
            if (srcs.length > 0) setSelectedSourceId(srcs[0].id);
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
        reset();
        await start(mediaStream);
    }, [selectedSourceId, start, reset]);

    const handleStop = useCallback(async () => {
        const result = await stop();
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setStream(null);
        }
        await refresh();
        onLoad({ ...result, filename: result.savedFilename });
    }, [stop, stream, refresh, onLoad]);

    const handleSelect = useCallback(async (meta: RecordingMeta) => {
        const data = await window.api.loadRecordingFromDisk(meta.filename);
        if (!data) return;
        const videoBuffer = data.videoBase64
            ? Uint8Array.from(atob(data.videoBase64), (c) => c.charCodeAt(0)).buffer
            : null;
        onLoad({
            filename: meta.filename,
            startTime: 0,
            packets: data.packets as PacketEntry[],
            videoBuffer,
        });
    }, [onLoad]);

    const favorites = sorted.filter((r) => r.isFavorite);
    const rest = sorted.filter((r) => !r.isFavorite);

    return (
        <Flex direction="column" h="100%" overflow="hidden" bg="gray.950">
            {/* Record controls */}
            <Box px={2} pt={2} pb={1} flexShrink={0} borderBottom="1px solid" borderColor="whiteAlpha.100">
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
                        fontSize: "11px",
                        outline: "none",
                        marginBottom: "6px",
                    }}
                >
                    {sources.map((s) => (
                        <option key={s.id} value={s.id} style={{ background: "#1a1a2e" }}>
                            {s.name}
                        </option>
                    ))}
                </select>

                <Flex align="center" gap={2}>
                    {!isRecording ? (
                        <button
                            onClick={handleRecord}
                            disabled={!selectedSourceId || isProcessing}
                            style={{
                                flex: 1,
                                background: "rgba(220,38,38,0.15)",
                                color: "#fca5a5",
                                border: "1px solid rgba(220,38,38,0.3)",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                fontSize: "11px",
                                cursor: !selectedSourceId || isProcessing ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                opacity: !selectedSourceId || isProcessing ? 0.5 : 1,
                            }}
                        >
                            <LuCircle size={9} />
                            Record
                        </button>
                    ) : (
                        <button
                            onClick={handleStop}
                            style={{
                                flex: 1,
                                background: "rgba(255,255,255,0.08)",
                                color: "white",
                                border: "1px solid rgba(255,255,255,0.15)",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                fontSize: "11px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            <LuSquare size={9} />
                            Stop
                        </button>
                    )}

                    {isRecording && (
                        <Flex align="center" gap={1}>
                            <Box w="6px" h="6px" borderRadius="full" bg="red.400" />
                            <Text fontSize="10px" fontFamily="mono" color="red.300">
                                {formatDuration(duration)}
                            </Text>
                        </Flex>
                    )}
                    {isProcessing && (
                        <Text fontSize="10px" color="whiteAlpha.400">
                            Saving...
                        </Text>
                    )}
                </Flex>
            </Box>

            {/* Recording list */}
            <Box flex={1} overflowY="auto" css={{ "&::-webkit-scrollbar": { width: "4px" }, "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "2px" } }}>
                {loading && (
                    <Text fontSize="10px" color="whiteAlpha.400" px={2} pt={2}>
                        Loading...
                    </Text>
                )}

                {!loading && sorted.length === 0 && (
                    <Text fontSize="10px" color="whiteAlpha.300" px={2} pt={2}>
                        No recordings yet.
                    </Text>
                )}

                {favorites.length > 0 && (
                    <>
                        <SectionHeader label="Favorites" />
                        {favorites.map((rec) => (
                            <RecordingRow
                                key={rec.filename}
                                meta={rec}
                                isActive={rec.filename === activeFilename}
                                onSelect={() => handleSelect(rec)}
                                onDelete={() => deleteRecording(rec.filename)}
                                onRename={(name) => renameRecording(rec.filename, name)}
                                onToggleFavorite={() => toggleFavorite(rec.filename)}
                                onMoveUp={() => moveFavoriteUp(rec.filename)}
                                onMoveDown={() => moveFavoriteDown(rec.filename)}
                                showMoveButtons
                            />
                        ))}
                    </>
                )}

                {rest.length > 0 && (
                    <>
                        <SectionHeader label="All" />
                        {rest.map((rec) => (
                            <RecordingRow
                                key={rec.filename}
                                meta={rec}
                                isActive={rec.filename === activeFilename}
                                onSelect={() => handleSelect(rec)}
                                onDelete={() => deleteRecording(rec.filename)}
                                onRename={(name) => renameRecording(rec.filename, name)}
                                onToggleFavorite={() => toggleFavorite(rec.filename)}
                                showMoveButtons={false}
                            />
                        ))}
                    </>
                )}
            </Box>
        </Flex>
    );
};

const SectionHeader = ({ label }: { label: string }) => (
    <Text
        fontSize="9px"
        fontWeight="bold"
        color="whiteAlpha.400"
        letterSpacing="widest"
        px={2}
        pt={2}
        pb={1}
        textTransform="uppercase"
    >
        {label}
    </Text>
);

interface RecordingRowProps {
    meta: RecordingMeta;
    isActive: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onRename: (name: string) => void;
    onToggleFavorite: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    showMoveButtons: boolean;
}

const RecordingRow = ({
    meta,
    isActive,
    onSelect,
    onDelete,
    onRename,
    onToggleFavorite,
    onMoveUp,
    onMoveDown,
    showMoveButtons,
}: RecordingRowProps) => {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(meta.metadata.name);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleNameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(meta.metadata.name);
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const commitRename = () => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== meta.metadata.name) {
            onRename(trimmed);
        }
        setEditing(false);
    };

    const date = new Date(meta.metadata.createdAt).toLocaleDateString();
    const duration = formatDurationMs(meta.metadata.durationMs);

    return (
        <Flex
            direction="column"
            px={2}
            py="5px"
            cursor="pointer"
            bg={isActive ? "rgba(212,240,0,0.08)" : "transparent"}
            borderLeft="2px solid"
            borderLeftColor={isActive ? "#d4f000" : "transparent"}
            _hover={{ bg: isActive ? "rgba(212,240,0,0.1)" : "whiteAlpha.50" }}
            onClick={onSelect}
            transition="background 0.1s"
            gap={1}
        >
            {/* Name row */}
            <Flex align="center" gap={1}>
                {editing ? (
                    <Input
                        ref={inputRef}
                        size="xs"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditing(false);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        bg="whiteAlpha.100"
                        border="1px solid"
                        borderColor="whiteAlpha.300"
                        fontFamily="mono"
                        fontSize="10px"
                        h="18px"
                        flex={1}
                    />
                ) : (
                    <Text
                        fontSize="10px"
                        color="whiteAlpha.800"
                        flex={1}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        onClick={handleNameClick}
                        title={meta.metadata.name}
                    >
                        {meta.metadata.name}
                    </Text>
                )}
            </Flex>

            {/* Meta + actions row */}
            <Flex align="center" gap={1}>
                <Text fontSize="9px" color="whiteAlpha.400" flex={1}>
                    {date} · {duration}
                </Text>

                {showMoveButtons && (
                    <>
                        <IconButton
                            aria-label="Move up"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.400"
                            _hover={{ color: "white", bg: "whiteAlpha.100" }}
                            h="14px"
                            w="14px"
                            minW="14px"
                            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                        >
                            <LuChevronUp size={9} />
                        </IconButton>
                        <IconButton
                            aria-label="Move down"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.400"
                            _hover={{ color: "white", bg: "whiteAlpha.100" }}
                            h="14px"
                            w="14px"
                            minW="14px"
                            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                        >
                            <LuChevronDown size={9} />
                        </IconButton>
                    </>
                )}

                <IconButton
                    aria-label={meta.isFavorite ? "Unstar" : "Star"}
                    size="xs"
                    variant="ghost"
                    color={meta.isFavorite ? "#d4f000" : "whiteAlpha.400"}
                    _hover={{ color: meta.isFavorite ? "#bfdb00" : "#d4f000", bg: "whiteAlpha.100" }}
                    h="14px"
                    w="14px"
                    minW="14px"
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                >
                    <LuStar size={9} fill={meta.isFavorite ? "currentColor" : "none"} />
                </IconButton>

                <IconButton
                    aria-label="Delete"
                    size="xs"
                    variant="ghost"
                    color="whiteAlpha.300"
                    _hover={{ color: "red.400", bg: "whiteAlpha.100" }}
                    h="14px"
                    w="14px"
                    minW="14px"
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                    <LuTrash2 size={9} />
                </IconButton>
            </Flex>
        </Flex>
    );
};
