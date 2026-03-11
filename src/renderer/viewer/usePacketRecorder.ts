import { useCallback, useEffect, useRef, useState } from "react";

export type PacketEntry = {
    typeName: string;
    data: Record<string, unknown>;
    relativeMs: number;
};

export type Recording = {
    startTime: number;
    packets: PacketEntry[];
    videoBuffer: ArrayBuffer | null;
};

export type RecordingMeta = {
    filename: string;
    metadata: { name: string; createdAt: string; durationMs: number };
    isFavorite?: boolean;
};

export type RecorderStatus = "idle" | "recording" | "processing" | "done";

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
}

export const formatDurationMs = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};

/**
 * Manages packet + screen recording for the Packet Viewer.
 *
 * Usage:
 *   const { status, start, stop, duration } = usePacketRecorder();
 *   await start(mediaStream);  // pass stream from desktopCapturer
 *   await stop();              // saves recording to main process
 */
export const usePacketRecorder = () => {
    const [status, setStatus] = useState<RecorderStatus>("idle");
    const [duration, setDuration] = useState(0);
    const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

    const startTimeRef = useRef<number>(0);
    const packetsRef = useRef<PacketEntry[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRecordingRef = useRef(false);

    const packetHandler = useCallback(
        (_event: Electron.IpcRendererEvent, payload: { typeName: string; data: unknown }) => {
            if (!isRecordingRef.current) return;
            packetsRef.current.push({
                typeName: payload.typeName,
                data: payload.data as Record<string, unknown>,
                relativeMs: Date.now() - startTimeRef.current,
            });
        },
        [],
    );

    // Register once on mount, deregister on unmount — prevents listener accumulation
    useEffect(() => {
        window.api.onAnyServerPacket(packetHandler);
        return () => { window.api.offAnyServerPacket(packetHandler); };
    }, [packetHandler]);

    const start = useCallback(
        async (stream: MediaStream) => {
            packetsRef.current = [];
            chunksRef.current = [];
            startTimeRef.current = Date.now();
            isRecordingRef.current = true;
            setRecordingStartTime(startTimeRef.current);
            setDuration(0);
            setStatus("recording");

            // Start screen recording
            const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.start(100); // collect chunks every 100ms

            // Duration ticker
            tickRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 1000);
        },
        [packetHandler],
    );

    const stop = useCallback(async (): Promise<Recording & { savedFilename: string }> => {
        setStatus("processing");

        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }

        isRecordingRef.current = false;
        startTimeRef.current = 0;
        setRecordingStartTime(null);

        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current;
            const packets = [...packetsRef.current];
            if (!recorder || recorder.state === "inactive") {
                const recording: Recording = { startTime: 0, packets, videoBuffer: null };
                window.api.saveRecordingToDisk({ packets: recording.packets, videoBase64: null }).then((savedFilename) => {
                    setStatus("done");
                    resolve({ ...recording, savedFilename });
                });
                return;
            }

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: "video/webm" });
                const videoBuffer = await blob.arrayBuffer();
                const videoBase64 = arrayBufferToBase64(videoBuffer);
                const recording: Recording = { startTime: 0, packets, videoBuffer };
                const savedFilename = await window.api.saveRecordingToDisk({ packets, videoBase64 });
                setStatus("done");
                resolve({ ...recording, savedFilename });
            };

            recorder.stop();
        });
    }, []);

    const reset = useCallback(() => {
        isRecordingRef.current = false;
        packetsRef.current = [];
        chunksRef.current = [];
        startTimeRef.current = 0;
        mediaRecorderRef.current = null;
        setRecordingStartTime(null);
        setStatus("idle");
        setDuration(0);
    }, []);

    return { status, duration, start, stop, reset, recordingStartTime };
};

export const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
};

export const formatMs = (ms: number): string => {
    const totalSeconds = ms / 1000;
    const m = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
    const s = (totalSeconds % 60).toFixed(1).padStart(4, "0");
    return `${m}:${s}`;
};
