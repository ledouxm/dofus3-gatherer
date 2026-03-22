import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { PacketEntry } from "./usePacketRecorder";

export type LivePacketEntry = PacketEntry & { arrivalTime: number };

/**
 * Maintains a circular buffer of the last `maxPackets` received packets.
 * Always listening — no start/stop needed.
 *
 * Packets are accumulated in a ref and flushed to state every `flushMs` ms,
 * so bursts of packets cause a single React update instead of one per packet.
 *
 * @param maxPackets  Max buffer size (default 500)
 * @param recordingStartTime  Absolute timestamp (Date.now()) when recording started, or null
 * @param flushMs  How often to flush the buffer to state (default 100ms)
 */
export function useLiveLog(maxPackets = 500, recordingStartTime: number | null = null, frozenRef?: MutableRefObject<boolean>, flushMs = 100) {
    const [packets, setPackets] = useState<LivePacketEntry[]>([]);
    const sessionStart = useRef(Date.now());
    const pendingRef = useRef<LivePacketEntry[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const flush = () => {
            flushTimerRef.current = null;
            const incoming = pendingRef.current;
            if (incoming.length === 0) return;
            pendingRef.current = [];
            setPackets((prev) => {
                const next = [...prev, ...incoming];
                if (frozenRef?.current) return next; // user scrolled up — don't evict
                return next.length > maxPackets ? next.slice(next.length - maxPackets) : next;
            });
        };

        const id = window.api.addListener("server-packet-broadcast", (_e: Electron.IpcRendererEvent, payload: { typeName: string; data: unknown }) => {
            const now = Date.now();
            pendingRef.current.push({
                typeName: payload.typeName,
                data: payload.data as Record<string, unknown>,
                relativeMs: now - sessionStart.current,
                arrivalTime: now,
            });
            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(flush, flushMs);
            }
        });

        return () => {
            window.api.removeListener(id);
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
        };
    }, [maxPackets, flushMs]);

    const recordingThresholdMs =
        recordingStartTime !== null ? recordingStartTime - sessionStart.current : null;

    const clear = useCallback(() => {
        pendingRef.current = [];
        setPackets([]);
    }, []);

    return { packets, recordingThresholdMs, clear };
}
