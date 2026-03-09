import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordingMeta } from "./usePacketRecorder";

const FAVORITES_FILENAME = "recordings-favorites.json";

export const useRecordings = () => {
    const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [recs, favsConfig] = await Promise.all([
                window.api.listRecordings(),
                window.api.getConfig({ filename: FAVORITES_FILENAME }),
            ]);
            setRecordings(recs);
            setFavorites((favsConfig as { favorites?: string[] })?.favorites ?? []);
        } catch {}
        setLoading(false);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const sorted = useMemo(() => {
        const favSet = new Set(favorites);
        const favItems = favorites
            .map((fn) => recordings.find((r) => r.filename === fn))
            .filter((r): r is RecordingMeta => r !== undefined)
            .map((r) => ({ ...r, isFavorite: true }));
        const rest = recordings
            .filter((r) => !favSet.has(r.filename))
            .map((r) => ({ ...r, isFavorite: false }));
        return [...favItems, ...rest];
    }, [recordings, favorites]);

    const saveFavorites = useCallback(async (next: string[]) => {
        setFavorites(next);
        await window.api.saveConfig({ favorites: next }, { filename: FAVORITES_FILENAME });
    }, []);

    const toggleFavorite = useCallback(
        (filename: string) => {
            if (favorites.includes(filename)) {
                saveFavorites(favorites.filter((f) => f !== filename));
            } else {
                saveFavorites([...favorites, filename]);
            }
        },
        [favorites, saveFavorites],
    );

    const moveFavoriteUp = useCallback(
        (filename: string) => {
            const idx = favorites.indexOf(filename);
            if (idx <= 0) return;
            const next = [...favorites];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            saveFavorites(next);
        },
        [favorites, saveFavorites],
    );

    const moveFavoriteDown = useCallback(
        (filename: string) => {
            const idx = favorites.indexOf(filename);
            if (idx < 0 || idx >= favorites.length - 1) return;
            const next = [...favorites];
            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
            saveFavorites(next);
        },
        [favorites, saveFavorites],
    );

    const deleteRecording = useCallback(
        async (filename: string) => {
            await window.api.deleteRecording(filename);
            if (favorites.includes(filename)) {
                await saveFavorites(favorites.filter((f) => f !== filename));
            }
            await refresh();
        },
        [favorites, saveFavorites, refresh],
    );

    const renameRecording = useCallback(async (filename: string, name: string) => {
        await window.api.updateRecordingMetadata(filename, { name });
        await refresh();
    }, [refresh]);

    return {
        sorted,
        loading,
        refresh,
        toggleFavorite,
        moveFavoriteUp,
        moveFavoriteDown,
        deleteRecording,
        renameRecording,
    };
};
