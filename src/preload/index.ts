import { contextBridge } from "electron";

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("__IS_ELECTRON__", true);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-ignore
    window.__IS_ELECTRON__ = true;
}
