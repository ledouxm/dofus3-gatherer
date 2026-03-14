import { BrowserWindow } from "electron";

// Mutable server context initialized once in app.whenReady()
export const serverContext = {
    configDir: "",
    cacheDir: "",
    recordingsDir: "",
    cdnBaseUrl: "",
    travelWindow: null as BrowserWindow | null,
};
