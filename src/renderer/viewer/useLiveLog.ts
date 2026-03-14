import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { PacketEntry } from "./usePacketRecorder";
import { trpc } from "../trpc";

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
    const maxPacketsRef = useRef(maxPackets);
    maxPacketsRef.current = maxPackets;

    trpc.packets.onPacketBroadcast.useSubscription(undefined, {
        onData: (payload) => {
            const now = Date.now();
            const entry: LivePacketEntry = {
                typeName: payload.typeName,
                data: payload.data as Record<string, unknown>,
                relativeMs: now - sessionStart.current,
                arrivalTime: now,
            };
            setPackets((prev) => {
                const next = [...prev, entry];
                if (frozenRef?.current) return next;
                const max = maxPacketsRef.current;
                return next.length > max ? next.slice(next.length - max) : next;
            });
        },
    });

    const recordingThresholdMs =
        recordingStartTime !== null ? recordingStartTime - sessionStart.current : null;

    const clear = useCallback(() => setPackets([]), []);

    return { packets, recordingThresholdMs, clear };
}
