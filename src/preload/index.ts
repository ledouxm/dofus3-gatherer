import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { CompiledQuery, QueryResult } from "kysely";
import path from "node:path";
import fs from "fs/promises";

const configFolder = path.join(process.env.USER_DATA_PATH!, "config");

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
    getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke("open-external", url),
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
    // Packet Viewer APIs
    exportRecording: (data: { packets: unknown[]; videoBase64: string | null }): Promise<boolean> =>
        ipcRenderer.invoke("export-recording", data),
    importRecording: (): Promise<{ packets: unknown[]; videoBase64: string | null } | null> =>
        ipcRenderer.invoke("import-recording"),
    saveRecording: (data: { packets: unknown[]; videoBuffer: ArrayBuffer | null }): Promise<void> =>
        ipcRenderer.invoke("save-recording", data),
    getRecording: (): Promise<{ packets: unknown[]; videoBuffer: ArrayBuffer | null } | null> =>
        ipcRenderer.invoke("get-recording"),
    getDesktopSources: (): Promise<Electron.DesktopCapturerSource[]> =>
        ipcRenderer.invoke("get-desktop-sources"),
    getOpenWindows: (): Promise<{ handle: number; title: string }[]> =>
        ipcRenderer.invoke("get-open-windows"),
    focusWindowAndSend: (handle: number, action: "H" | "travel"): Promise<void> =>
        ipcRenderer.invoke("focus-window-and-send", { handle, action }),
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
