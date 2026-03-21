import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { CompiledQuery, QueryResult } from "kysely";
import path from "node:path";
import fs from "fs/promises";

const configFolder = path.join(process.env.USER_DATA_PATH!, "config");
const harvestLogPath = path.join(configFolder, "harvest-log.jsonl");

// Stable listener registry: fixes contextBridge re-wrapping renderer functions on each call,
// which prevents ipcRenderer.off from ever matching what ipcRenderer.on registered.
const _listenerRegistry = new Map<number, { channel: string; wrapper: (e: Electron.IpcRendererEvent, ...a: any[]) => void }>();
let _nextListenerId = 0;

if (!configFolder) {
    throw new Error("Config folder path is not defined");
}

const defaultConfigFilename = "config.json";
const defaultConfig = {};

function resolveConfigPath(filename: string): string {
    const resolved = path.resolve(configFolder, filename);
    if (!resolved.startsWith(configFolder + path.sep)) {
        throw new Error(`Invalid config filename: "${filename}"`);
    }
    return resolved;
}

// Custom APIs for renderer
const api = {
    getConfig: async ({ filename = defaultConfigFilename } = {}) => {
        const configPath = resolveConfigPath(filename);
        try {
            try {
                await fs.access(configPath);
                const response = await fs
                    .readFile(configPath, "utf-8")
                    .then((data) => JSON.parse(data));
                return response;
            } catch {
                await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
                return defaultConfig;
            }
        } catch (error) {
            console.error("Error getting config:", error);
            throw error;
        }
    },
    saveConfig: async (config: any, { filename = defaultConfigFilename } = {}) => {
        const configPath = resolveConfigPath(filename);
        try {
            await fs.mkdir(configFolder, { recursive: true }).catch((err) => {});
            let existing: any = {};
            try {
                existing = JSON.parse(await fs.readFile(configPath, "utf-8"));
            } catch {}
            await fs.writeFile(configPath, JSON.stringify({ ...existing, ...config }, null, 2), "utf-8");
        } catch (error) {
            console.error("Error saving config:", error);
            throw error;
        }
    },
    appendHarvestEntry: async (entry: {
        resourceId: number;
        quantity: number;
        mapId: number | null;
        timestamp: string;
    }): Promise<void> => {
        await fs.mkdir(configFolder, { recursive: true }).catch(() => {});
        await fs.appendFile(harvestLogPath, JSON.stringify(entry) + "\n", "utf-8");
    },
    readHarvestLog: async (): Promise<Array<{
        resourceId: number;
        quantity: number;
        mapId: number | null;
        timestamp: string;
    }>> => {
        try {
            const raw = await fs.readFile(harvestLogPath, "utf-8");
            return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
        } catch {
            return [];
        }
    },
    getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open-external", url),
    openUserDataFolder: (): Promise<void> => ipcRenderer.invoke("open-user-data-folder"),
    sql: <Q>(query: CompiledQuery<Q>): Promise<QueryResult<Q>> => ipcRenderer.invoke("sql", query),
    getRecoltables: (resourceId: string): Promise<any[]> =>
        ipcRenderer.invoke("get-recoltables", resourceId),
    toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke("toggle-always-on-top"),
    getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke("get-always-on-top"),
    minimizeWindow: (): void => { ipcRenderer.send("minimize-window"); },
    closeWindow: (): void => { ipcRenderer.send("close-window"); },
    on: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.on(channel, listener),
    once: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.once(channel, listener),
    off: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.off(channel, listener),
    // ID-based listener registration: avoids contextBridge re-wrapping the renderer function
    // on each call, which makes ipcRenderer.off unable to match what ipcRenderer.on registered.
    addListener: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): number => {
        const id = _nextListenerId++;
        const wrapper = (event: Electron.IpcRendererEvent, ...args: any[]) => listener(event, ...args);
        _listenerRegistry.set(id, { channel, wrapper });
        ipcRenderer.on(channel, wrapper);
        return id;
    },
    removeListener: (id: number): void => {
        const entry = _listenerRegistry.get(id);
        if (entry) {
            ipcRenderer.off(entry.channel, entry.wrapper);
            _listenerRegistry.delete(id);
        }
    },
    // Packet Viewer APIs
    exportRecording: (data: { packets: unknown[]; videoBase64: string | null }): Promise<boolean> =>
        ipcRenderer.invoke("export-recording", data),
    importRecording: (): Promise<{ packets: unknown[]; videoBase64: string | null } | null> =>
        ipcRenderer.invoke("import-recording"),
    saveRecording: (data: { packets: unknown[]; videoBuffer: ArrayBuffer | null }): Promise<void> =>
        ipcRenderer.invoke("save-recording", data),
    getRecording: (): Promise<{ packets: unknown[]; videoBuffer: ArrayBuffer | null } | null> =>
        ipcRenderer.invoke("get-recording"),
    // Disk-based recording APIs
    saveRecordingToDisk: (data: { packets: unknown[]; videoBase64: string | null; name?: string }): Promise<string> =>
        ipcRenderer.invoke("save-recording-to-disk", data),
    listRecordings: (): Promise<{ filename: string; metadata: { name: string; createdAt: string; durationMs: number } }[]> =>
        ipcRenderer.invoke("list-recordings"),
    loadRecordingFromDisk: (filename: string): Promise<{ packets: unknown[]; videoBase64: string | null; metadata: { name: string; createdAt: string; durationMs: number } } | null> =>
        ipcRenderer.invoke("load-recording-from-disk", filename),
    deleteRecording: (filename: string): Promise<boolean> =>
        ipcRenderer.invoke("delete-recording", filename),
    updateRecordingMetadata: (filename: string, updates: { name?: string }): Promise<boolean> =>
        ipcRenderer.invoke("update-recording-metadata", filename, updates),
    getDesktopSources: (): Promise<Electron.DesktopCapturerSource[]> =>
        ipcRenderer.invoke("get-desktop-sources"),
    getOpenWindows: (): Promise<{ handle: number; title: string }[]> =>
        ipcRenderer.invoke("get-open-windows"),
    focusWindowAndSend: (handle: number, action: "H" | "travel"): Promise<void> =>
        ipcRenderer.invoke("focus-window-and-send", { handle, action }),
    openTravelWindow: (): Promise<void> => ipcRenderer.invoke("open-travel-window"),
    onAnyServerPacket: (
        listener: (event: Electron.IpcRendererEvent, data: { typeName: string; data: unknown }) => void,
    ) => ipcRenderer.on("server-packet-broadcast", listener),
    offAnyServerPacket: (
        listener: (event: Electron.IpcRendererEvent, data: { typeName: string; data: unknown }) => void,
    ) => ipcRenderer.off("server-packet-broadcast", listener),
    getInitStatus: (): Promise<{ id: string; label: string; status: string; progress?: number }[]> =>
        ipcRenderer.invoke("get-init-status"),
    onInitStatus: (
        listener: (event: Electron.IpcRendererEvent, steps: { id: string; label: string; status: string; progress?: number }[]) => void,
    ) => ipcRenderer.on("init-status", listener),
    offInitStatus: (
        listener: (event: Electron.IpcRendererEvent, steps: { id: string; label: string; status: string; progress?: number }[]) => void,
    ) => ipcRenderer.off("init-status", listener),
    decodeWithAllTargets: (typeNames: string[], samples: Array<{ obfTypeName: string; hex: string }>): Promise<Array<{ obfTypeName: string; fullTypeName: string; cleanData: Record<string, unknown> }>> =>
        ipcRenderer.invoke("decode-with-all-targets", { typeNames, samples }),
    getDofusVersion: (): Promise<string | null> => ipcRenderer.invoke("get-dofus-version"),
    getAdminToken: (): Promise<string | null> => ipcRenderer.invoke("get-admin-token"),
    getMappingsSyncResult: (): Promise<{ updated: boolean; mappings?: Record<string, string>; timestamp?: string }> =>
        ipcRenderer.invoke("get-mappings-sync-result"),
    pickGanymedeFolder: (): Promise<string | null> => ipcRenderer.invoke("pick-ganymede-folder"),
    getDefaultGanymedePath: (): Promise<string | null> => ipcRenderer.invoke("get-default-ganymede-path"),
    readGuidesFolder: async (folderPath: string): Promise<any[]> => {
        const entries: any[] = [];
        try {
            const allFiles = await fs.readdir(folderPath, { recursive: true });
            for (const f of allFiles) {
                const filePath = path.join(folderPath, f as string);
                if (!filePath.endsWith(".json")) continue;
                try {
                    const raw = await fs.readFile(filePath, "utf-8");
                    const data = JSON.parse(raw);
                    if (!data || typeof data.id !== "number" || !Array.isArray(data.steps)) continue;
                    entries.push({
                        filePath,
                        id: data.id,
                        name: data.name ?? path.basename(filePath, ".json"),
                        description: data.description ?? null,
                        node_image: data.node_image ?? null,
                        stepCount: data.steps.length,
                        lang: data.lang,
                    });
                } catch {}
            }
        } catch {}
        return entries.sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
    readGuideFile: async (filePath: string): Promise<any | null> => {
        try {
            const raw = await fs.readFile(filePath, "utf-8");
            return JSON.parse(raw);
        } catch {
            return null;
        }
    },
    readGuidesConf: async (confJsonPath: string): Promise<{ progresses: any[]; profileName: string } | null> => {
        try {
            const raw = await fs.readFile(confJsonPath, "utf-8");
            const conf = JSON.parse(raw);
            const profileId = conf.profileInUse;
            const profile =
                conf.profiles?.find((p: any) => p.id === profileId) ?? conf.profiles?.[0];
            if (!profile) return null;
            return {
                progresses: profile.progresses ?? [],
                profileName: profile.name ?? "Player",
            };
        } catch {
            return null;
        }
    },
    writeGuidesConf: async (confJsonPath: string, progresses: any[]): Promise<void> => {
        try {
            const raw = await fs.readFile(confJsonPath, "utf-8");
            const conf = JSON.parse(raw);
            const profileId = conf.profileInUse;
            const idx = conf.profiles?.findIndex((p: any) => p.id === profileId) ?? -1;
            const profileIdx = idx !== -1 ? idx : 0;
            if (conf.profiles?.[profileIdx]) {
                conf.profiles[profileIdx].progresses = progresses;
            }
            await fs.writeFile(confJsonPath, JSON.stringify(conf, null, 2), "utf-8");
        } catch {}
    },
    fetchGuidesFromServer: (status: string): Promise<any[]> =>
        ipcRenderer.invoke("fetch-guides-from-server", status),
    downloadGuideFromServer: (guideId: number, folderPath: string): Promise<boolean> =>
        ipcRenderer.invoke("download-guide-from-server", guideId, folderPath),
    onUpdateStatus: (listener: (payload: { status: string; version?: string; percent?: number }) => void): void => {
        ipcRenderer.on("update-status", (_event, payload) => listener(payload));
    },
    quitAndInstall: (): void => {
        ipcRenderer.invoke("quit-and-install");
    },
};

export type AppApi = typeof api;

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("electron", electronAPI);
        contextBridge.exposeInMainWorld("api", api);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI;
    // @ts-ignore (define in dts)
    window.api = api;
}
