import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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
export function useLiveLog(maxPackets = 500, recordingStartTime: number | null = null, frozenRef?: MutableRefObject<boolean>) {
    const [packets, setPackets] = useState<LivePacketEntry[]>([]);
    const sessionStart = useRef(Date.now());

    useEffect(() => {
        const id = window.api.addListener("server-packet-broadcast", (_e: Electron.IpcRendererEvent, payload: { typeName: string; data: unknown }) => {
            const now = Date.now();
            const entry: LivePacketEntry = {
                typeName: payload.typeName,
                data: payload.data as Record<string, unknown>,
                relativeMs: now - sessionStart.current,
                arrivalTime: now,
            };
            setPackets((prev) => {
                const next = [...prev, entry];
                if (frozenRef?.current) return next; // user scrolled up — don't evict
                return next.length > maxPackets ? next.slice(next.length - maxPackets) : next;
            });
        });
        return () => window.api.removeListener(id);
    }, [maxPackets]);

    const recordingThresholdMs =
        recordingStartTime !== null ? recordingStartTime - sessionStart.current : null;

    const clear = useCallback(() => setPackets([]), []);

    return { packets, recordingThresholdMs, clear };
}
