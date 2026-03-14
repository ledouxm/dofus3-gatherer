import { z } from "zod";
import path from "node:path";
import { promises as fs } from "fs";
import { app, shell, BrowserWindow } from "electron";
import { ofetch } from "ofetch";
import { router, publicProcedure } from "../trpc";
import { serverContext } from "../serverContext";
import { getDofusVersion } from "../../db";
import { env } from "../../env-vars";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function readMainConfig(): Promise<any> {
    const configPath = path.join(serverContext.configDir, "config.json");
    try {
        return JSON.parse(await fs.readFile(configPath, "utf-8"));
    } catch {
        return {};
    }
}

async function writeMainConfig(config: any): Promise<void> {
    const configPath = path.join(serverContext.configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

async function getCachedRecoltables(resourceId: string): Promise<any[] | null> {
    const cachePath = path.join(serverContext.cacheDir, `recoltables2-${resourceId}.json`);
    try {
        const { timestamp, data } = JSON.parse(await fs.readFile(cachePath, "utf-8"));
        if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    } catch {}
    return null;
}

async function setCachedRecoltables(resourceId: string, data: any[]): Promise<void> {
    const cachePath = path.join(serverContext.cacheDir, `recoltables2-${resourceId}.json`);
    await fs.writeFile(cachePath, JSON.stringify({ timestamp: Date.now(), data }), "utf-8");
}

export const appRouter = router({
    getVersion: publicProcedure.query(() => app.getVersion()),

    getAlwaysOnTop: publicProcedure.query(() => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        return win?.isAlwaysOnTop() ?? false;
    }),

    toggleAlwaysOnTop: publicProcedure.mutation(async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        const newState = !win.isAlwaysOnTop();
        win.setAlwaysOnTop(newState);
        const config = await readMainConfig();
        await writeMainConfig({ ...config, alwaysOnTop: newState });
        return newState;
    }),

    minimizeWindow: publicProcedure.mutation(() => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        win?.minimize();
    }),

    closeWindow: publicProcedure.mutation(() => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        win?.close();
    }),

    openExternal: publicProcedure.input(z.object({ url: z.string() })).mutation(({ input }) =>
        shell.openExternal(input.url),
    ),

    openUserDataFolder: publicProcedure.mutation(() =>
        shell.openPath(app.getPath("userData")),
    ),

    openTravelWindow: publicProcedure.mutation(() => {
        // Handled by main/index.ts via serverContext.travelWindow
        const tw = serverContext.travelWindow;
        if (tw && !tw.isDestroyed()) {
            tw.focus();
        } else {
            // Signal main to create the window via the exported helper
            openTravelWindowCallback?.();
        }
    }),

    getDofusVersion: publicProcedure.query(() => getDofusVersion()),

    getAdminToken: publicProcedure.query(async () => {
        const filePath = path.join(app.getPath("userData"), ".dofus-gatherer-admin");
        try {
            const content = await fs.readFile(filePath, "utf-8");
            return content.trim() || null;
        } catch {
            return null;
        }
    }),

    getMappingsSyncResult: publicProcedure.query(() => {
        // Resolved lazily from main process via callback
        return getMappingsSyncResultCallback?.() ?? Promise.resolve({ updated: false });
    }),

    getRecoltables: publicProcedure
        .input(z.object({ resourceId: z.string() }))
        .query(async ({ input }) => {
            const config = await readMainConfig();
            const cdnBase = config.cdnBaseUrl || env.VITE_CDN_BASE_URL;
            if (!cdnBase) return null;
            const cached = await getCachedRecoltables(input.resourceId);
            if (cached) return cached;
            const url = `${cdnBase}/recoltables/recoltables-${input.resourceId}.json`;
            const result = await ofetch(url).catch(() => null);
            const data = result?.data ?? null;
            if (data) await setCachedRecoltables(input.resourceId, data);
            return data;
        }),

    decodeWithAllTargets: publicProcedure
        .input(
            z.object({
                typeNames: z.array(z.string()),
                samples: z.array(z.object({ obfTypeName: z.string(), hex: z.string() })),
            }),
        )
        .mutation(() => {
            throw new Error("decodeWithAllTargets is not implemented");
        }),
});

// Callbacks set by main/index.ts after initialization
let openTravelWindowCallback: (() => void) | null = null;
let getMappingsSyncResultCallback: (() => Promise<{ updated: boolean; mappings?: any; timestamp?: string }>) | null = null;

export function setAppRouterCallbacks(callbacks: {
    openTravelWindow: () => void;
    getMappingsSyncResult: () => Promise<{ updated: boolean; mappings?: any; timestamp?: string }>;
}) {
    openTravelWindowCallback = callbacks.openTravelWindow;
    getMappingsSyncResultCallback = callbacks.getMappingsSyncResult;
}
