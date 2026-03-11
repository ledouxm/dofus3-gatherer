import { useCallback, useEffect, useRef, useState } from "react";
import type { PacketEntry } from "./usePacketRecorder";

export type LivePacketEntry = PacketEntry & { arrivalTime: number };

/**
 * Maintains a circular buffer of the last `maxPackets` received packets.
 * Always listening — no start/stop needed.
 *
 * @param maxPackets  Max buffer size (default 500)
 * @param recordingStartTime  Absolute timestamp (Date.now()) when recording started, or null
 * @returns packets  The live buffer
 * @returns recordingThresholdMs  relativeMs cutoff above which packets are part of the recording
 */
export function useLiveLog(maxPackets = 500, recordingStartTime: number | null = null) {
    const [packets, setPackets] = useState<LivePacketEntry[]>([]);
    const sessionStart = useRef(Date.now());

    useEffect(() => {
        const handler = (_e: Electron.IpcRendererEvent, payload: { typeName: string; data: unknown }) => {
            const now = Date.now();
            const entry: LivePacketEntry = {
                typeName: payload.typeName,
                data: payload.data as Record<string, unknown>,
                relativeMs: now - sessionStart.current,
                arrivalTime: now,
            };
            setPackets((prev) => {
                const next = [...prev, entry];
                return next.length > maxPackets ? next.slice(next.length - maxPackets) : next;
            });
        };
        window.api.onAnyServerPacket(handler);
        return () => window.api.offAnyServerPacket(handler);
    }, [maxPackets]);

    const recordingThresholdMs =
        recordingStartTime !== null ? recordingStartTime - sessionStart.current : null;

    const clear = useCallback(() => setPackets([]), []);

    return { packets, recordingThresholdMs, clear };
}
