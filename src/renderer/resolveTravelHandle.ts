import { mapStore } from "./providers/store";
import { trpcClient } from "./trpc";

/** Fetches open windows, finds the saved target by title, updates the store, and returns the title. */
export async function resolveTravelHandle(): Promise<string | null> {
    const [cfg, wins] = await Promise.all([
        trpcClient.config.get.query({ filename: "config.json" }),
        trpcClient.windows.getOpenWindows.query(),
    ]);
    const savedTitle = cfg?.travel?.selectedWindowTitle;
    const target = savedTitle ? wins.find((w) => w.title === savedTitle) : null;
    const win = target ?? wins.find((w) => w.title.endsWith("- Release")) ?? null;
    const title = win?.title ?? null;
    mapStore.set((v) => ({ ...v, travelTitle: title }));
    return title;
}
