import { useCallback, useRef, useState } from "react";

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

export type RecorderStatus = "idle" | "recording" | "processing" | "done";

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

    const startTimeRef = useRef<number>(0);
    const packetsRef = useRef<PacketEntry[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const packetHandler = useCallback(
        (_event: Electron.IpcRendererEvent, payload: { typeName: string; data: Record<string, unknown> }) => {
            if (!startTimeRef.current) return;
            packetsRef.current.push({
                typeName: payload.typeName,
                data: payload.data,
                relativeMs: Date.now() - startTimeRef.current,
            });
        },
        [],
    );

    const start = useCallback(
        async (stream: MediaStream) => {
            packetsRef.current = [];
            chunksRef.current = [];
            startTimeRef.current = Date.now();
            setDuration(0);
            setStatus("recording");

            // Listen to all decoded packets
            window.api.onAnyServerPacket(packetHandler);

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

    const stop = useCallback(async (): Promise<Recording> => {
        setStatus("processing");

        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }

        window.api.offAnyServerPacket(packetHandler);
        startTimeRef.current = 0;

        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current;
            const packets = [...packetsRef.current];
            if (!recorder || recorder.state === "inactive") {
                const recording: Recording = {
                    startTime: startTimeRef.current,
                    packets,
                    videoBuffer: null,
                };
                window.api.saveRecording({ packets: recording.packets, videoBuffer: null });
                setStatus("done");
                resolve(recording);
                return;
            }

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: "video/webm" });
                const videoBuffer = await blob.arrayBuffer();
                const recording: Recording = {
                    startTime: startTimeRef.current,
                    packets,
                    videoBuffer,
                };
                await window.api.saveRecording({ packets: recording.packets, videoBuffer });
                setStatus("done");
                resolve(recording);
            };

            recorder.stop();
        });
    }, [packetHandler]);

    const reset = useCallback(() => {
        packetsRef.current = [];
        chunksRef.current = [];
        startTimeRef.current = 0;
        mediaRecorderRef.current = null;
        setStatus("idle");
        setDuration(0);
    }, []);

    return { status, duration, start, stop, reset };
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
