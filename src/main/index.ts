import { app, BrowserWindow, clipboard, desktopCapturer, dialog, ipcMain } from "electron";
import { getAllWindows, Hardware } from "keysender";
import { shell } from "electron/common";
import path from "path";
import { spawnSync, execSync } from "child_process";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { getDb, getDofusVersion, makeDofusSqliteDb } from "./db";
import { makeSniffer } from "./sniffer/sniffer";
import { initDofusProto } from "./init/dofus-proto";
import protobuf from "protobufjs";
import { promises as fs } from "fs";
import { ofetch } from "ofetch";
import { env } from "./env-vars";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function readMainConfig(configDir: string): Promise<any> {
    const configPath = path.join(configDir, "config.json");
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function writeMainConfig(configDir: string, config: any): Promise<void> {
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

async function fetchRecoltable(cdnBaseUrl: string, resource: string): Promise<any[]> {
    const url = `${cdnBaseUrl}/recoltables/recoltables-${resource}.json`;
    const result = await ofetch(url).catch(() => null);
    return result?.data ?? null;
}

async function getCachedRecoltables(cacheDir: string, resourceId: string): Promise<any[] | null> {
    const cachePath = path.join(cacheDir, `recoltables-${resourceId}.json`);
    try {
        const raw = await fs.readFile(cachePath, "utf-8");
        const { timestamp, data } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    } catch {}
    return null;
}

async function setCachedRecoltables(
    cacheDir: string,
    resourceId: string,
    data: any[],
): Promise<void> {
    const cachePath = path.join(cacheDir, `recoltables-${resourceId}.json`);
    await fs.writeFile(cachePath, JSON.stringify({ timestamp: Date.now(), data }), "utf-8");
}
async function createWindow(configDir: string) {
    const savedConfig = await readMainConfig(configDir);
    const bounds = savedConfig.windowBounds ?? { width: 900, height: 670 };

    const mainWindow = new BrowserWindow({
        ...bounds,
        show: false,
        frame: false,
        backgroundColor: "#0a0a0a",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.js"),
            sandbox: false,
        },
    });

    if (savedConfig.alwaysOnTop) {
        mainWindow.setAlwaysOnTop(true);
    }

    let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null;
    const saveBounds = () => {
        if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
        saveBoundsTimer = setTimeout(async () => {
            const config = await readMainConfig(configDir);
            await writeMainConfig(configDir, { ...config, windowBounds: mainWindow.getBounds() });
        }, 500);
    };

    mainWindow.on("resize", saveBounds);
    mainWindow.on("move", saveBounds);

    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
    });

    setInterval(() => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("ping", new Date().toISOString());
        }
    }, 1000);

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        console.log(process.env["ELECTRON_RENDERER_URL"]);
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    return mainWindow;
}

if (is.dev) {
    app.setPath("userData", path.join(app.getPath("appData"), app.getName() + "-dev"));
}

function ensureNpcap() {
    try {
        execSync("reg query HKLM\\SOFTWARE\\Npcap", { stdio: "ignore" });
    } catch {
        const installerPath = is.dev
            ? path.join(__dirname, "../../resources/npcap-installer.exe")
            : path.join(process.resourcesPath, "npcap-installer.exe");
        spawnSync(installerPath, ["/S"], { stdio: "ignore" });
    }
}

type InitStepStatus = "pending" | "running" | "done" | "error";
type InitStep = { id: string; label: string; status: InitStepStatus; progress?: number };

app.whenReady().then(async () => {
    ensureNpcap();
    process.env.USER_DATA_PATH = app.getPath("userData");
    await fs
        .mkdir(path.join(process.env.USER_DATA_PATH, "config"), { recursive: true })
        .catch((err) => {});
    electronApp.setAppUserModelId("fr.ledouxm");

    app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
        // Enable Ctrl+R reload in production builds
        window.webContents.on("before-input-event", (_event, input) => {
            if (input.type === "keyDown" && (input.control || input.meta) && input.key === "r") {
                window.reload();
            }
        });
    });

    const configDir = path.join(process.env.USER_DATA_PATH!, "config");
    const cacheDir = path.join(process.env.USER_DATA_PATH!, "cache");
    await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});

    // Ensure config.json exists on first run
    const existingConfig = await readMainConfig(configDir);
    await writeMainConfig(configDir, {
        ...existingConfig,
        cdnBaseUrl: existingConfig.cdnBaseUrl || env.VITE_CDN_BASE_URL || "",
    });

    if (!existingConfig.cdnBaseUrl && !env.VITE_CDN_BASE_URL) {
        const { response } = await dialog.showMessageBox({
            type: "info",
            title: "CDN URL not configured",
            message: "Resource images won't load without a CDN URL.",
            detail:
                'Add a "cdnBaseUrl" field to config.json, then restart the app.\n\n' +
                'Example:\n  "cdnBaseUrl": "https://your-cdn-url"',
            buttons: ["Open Config Folder", "Quit"],
            defaultId: 0,
            cancelId: 1,
        });
        if (response === 0) {
            await shell.openPath(configDir);
            await new Promise((r) => setTimeout(r, 500));
        }
        app.quit();
        return;
    }

    // Register IPC handlers up front (sql is guarded by getDb() throwing if not ready)
    ipcMain.handle("get-app-version", () => app.getVersion());
    ipcMain.handle("open-external", (_event, url: string) => shell.openExternal(url));
    ipcMain.handle("sql", (_event, query) => getDb().executeQuery(query));
    ipcMain.handle("toggle-always-on-top", async () => {
        const mainWin = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        const newState = !mainWin.isAlwaysOnTop();
        mainWin.setAlwaysOnTop(newState);
        const config = await readMainConfig(configDir);
        await writeMainConfig(configDir, { ...config, alwaysOnTop: newState });
        return newState;
    });
    ipcMain.handle("get-always-on-top", () => {
        const mainWin = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        return mainWin.isAlwaysOnTop();
    });
    ipcMain.on("minimize-window", (event) => {
        BrowserWindow.fromWebContents(event.sender)?.minimize();
    });
    ipcMain.on("close-window", (event) => {
        BrowserWindow.fromWebContents(event.sender)?.close();
    });
    ipcMain.handle("get-recoltables", async (_event, resourceId: string) => {
        const config = await readMainConfig(configDir);
        const cdnBaseUrl = config.cdnBaseUrl || env.VITE_CDN_BASE_URL;
        if (!cdnBaseUrl) return null;
        const cached = await getCachedRecoltables(cacheDir, resourceId);
        if (cached) return cached;
        const data = await fetchRecoltable(cdnBaseUrl, resourceId);
        if (data) await setCachedRecoltables(cacheDir, resourceId, data);
        return data;
    });

    // In-memory recording storage shared between windows
    let currentRecording: { packets: unknown[]; videoBuffer: ArrayBuffer | null } | null = null;
    ipcMain.handle("save-recording", (_event, data) => {
        currentRecording = data;
    });
    ipcMain.handle("get-recording", () => currentRecording);

    ipcMain.handle(
        "export-recording",
        async (_event, data: { packets: unknown[]; videoBase64: string | null }) => {
            const { filePath } = await dialog.showSaveDialog({
                title: "Save Recording",
                defaultPath: `recording-${Date.now()}.dfrec`,
                filters: [{ name: "Dofus Recording", extensions: ["dfrec"] }],
            });
            if (!filePath) return false;
            await fs.writeFile(filePath, JSON.stringify(data), "utf-8");
            return true;
        },
    );

    ipcMain.handle("import-recording", async () => {
        const { filePaths } = await dialog.showOpenDialog({
            title: "Load Recording",
            filters: [{ name: "Dofus Recording", extensions: ["dfrec"] }],
            properties: ["openFile"],
        });
        if (!filePaths[0]) return null;
        const raw = await fs.readFile(filePaths[0], "utf-8");
        return JSON.parse(raw);
    });

    ipcMain.handle("pick-guides-folder", async () => {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: "Sélectionner le dossier de guides",
            properties: ["openDirectory"],
        });
        return canceled || !filePaths[0] ? null : filePaths[0];
    });

    ipcMain.handle("pick-guides-conf-file", async () => {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: "Charger un fichier conf.json (Ganymede)",
            filters: [{ name: "Ganymede Config", extensions: ["json"] }],
            properties: ["openFile"],
        });
        return canceled || !filePaths[0] ? null : filePaths[0];
    });

    const GANYMEDE_API = "https://ganymede-app.com/api";

    ipcMain.handle("fetch-guides-from-server", async (_e, status: string) => {
        const url = status
            ? `${GANYMEDE_API}/v2/guides?status=${status}`
            : `${GANYMEDE_API}/v2/guides`;
        return ofetch(url, { headers: { "User-Agent": "dofus3-gatherer" } });
    });

    ipcMain.handle("download-guide-from-server", async (_e, guideId: number, folderPath: string) => {
        const guide = await ofetch(`${GANYMEDE_API}/v2/guides/${guideId}`, {
            headers: { "User-Agent": "dofus3-gatherer" },
        });
        const dest = path.join(folderPath, `${guideId}.json`);
        await fs.writeFile(dest, JSON.stringify(guide, null, 2), "utf-8");
        return true;
    });

    ipcMain.handle("get-desktop-sources", () =>
        desktopCapturer.getSources({ types: ["window", "screen"] }),
    );

    ipcMain.handle("get-open-windows", () => {
        return getAllWindows()
            .map((w) => ({ handle: w.handle, title: w.title }))
            .filter((w) => w.title && w.title.trim() !== "");
    });

    ipcMain.handle(
        "focus-window-and-send",
        async (_event, { handle, action }: { handle: number; action: "H" | "travel" }) => {
            const hw = new Hardware(handle);
            hw.workwindow.setForeground();
            await new Promise((r) => setTimeout(r, 150));
            if (action === "H") {
                await hw.keyboard.sendKey("h");
            } else if (action === "travel") {
                const clipText = clipboard.readText().trim();
                const travelText = clipText.startsWith("/travel") ? clipText : null;
                if (!travelText) {
                    throw new Error("Clipboard does not contain a valid /travel command");
                }
                await hw.keyboard.sendKey("space");
                await new Promise((r) => setTimeout(r, 200));
                await hw.keyboard.printText(travelText);
                await hw.keyboard.sendKey("enter");
            }
        },
    );

    const steps: InitStep[] = [
        { id: "sqlite", label: "Downloading database", status: "running" },
        { id: "proto", label: "Downloading proto definitions", status: "running" },
    ];

    ipcMain.handle("get-init-status", () => steps);

    ipcMain.handle("get-dofus-version", () => getDofusVersion());

    ipcMain.handle("get-admin-token", async () => {
        const filePath = path.join(app.getPath("userData"), ".dofus-gatherer-admin");
        try {
            const content = await fs.readFile(filePath, "utf-8");
            return content.trim() || null;
        } catch {
            return null;
        }
    });

    const updateStep = (id: string, update: Partial<InitStep>) => {
        const step = steps.find((s) => s.id === id)!;
        Object.assign(step, update);
        BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) w.webContents.send("init-status", [...steps]);
        });
    };

    const windowPromise = createWindow(configDir);

    const dbPromise = makeDofusSqliteDb((progress) => updateStep("sqlite", { progress }))
        .then(() => updateStep("sqlite", { status: "done", progress: 1 }))
        .catch(() => updateStep("sqlite", { status: "error" }));

    const protoPromise = initDofusProto()
        .then((proto) => {
            updateStep("proto", { status: "done" });
            return proto;
        })
        .catch((e) => {
            updateStep("proto", { status: "error" });
            throw e;
        });

    const [mainWindow, , proto] = await Promise.all([windowPromise, dbPromise, protoPromise]);
    mainWindow.on("closed", () => app.quit());

    const templateMessage = proto.lookupType("TemplateMessage");

    function addRaw(data: Record<string, any>, type: protobuf.Type): void {
        const orderedFields = Object.values(type.fields).sort((a, b) => a.id - b.id);
        for (const field of orderedFields) {
            const value = data[field.name];
            if (field.resolvedType instanceof protobuf.Type && value != null) {
                if (field.repeated && Array.isArray(value)) {
                    for (const item of value) {
                        if (item && typeof item === "object") {
                            addRaw(item, field.resolvedType);
                        }
                    }
                } else if (typeof value === "object") {
                    addRaw(value, field.resolvedType);
                }
            }
        }
        data._raw = orderedFields.map((f) => f.type);
    }

    let serverReassemblyBuffer = Buffer.alloc(0);

    makeSniffer({
        onServerPacket: (packet) => {
            serverReassemblyBuffer = Buffer.concat([
                serverReassemblyBuffer,
                Buffer.from(packet, "hex"),
            ]);
            if (serverReassemblyBuffer.length > 5 * 1024 * 1024) {
                serverReassemblyBuffer = Buffer.alloc(0);
                return;
            }
            const buffer = serverReassemblyBuffer as any as Uint8Array;
            const reader = protobuf.Reader.create(buffer);
            while (reader.pos < reader.len) {
                const frameStart = reader.pos;
                let frameEnd = reader.pos;
                try {
                    const frameLen = reader.uint32();
                    frameEnd = reader.pos + frameLen;
                    if (frameEnd > reader.len) {
                        reader.pos = frameStart;
                        break;
                    }
                    const result = templateMessage.decode(buffer.subarray(reader.pos, frameEnd));
                    const json = result.toJSON() as {
                        event?: { data?: { typeUrl: string; value?: string } };
                        payload?: { data?: { typeUrl: string; value?: string } };
                    };

                    const anyData = json?.payload?.data ?? json?.event?.data;
                    if (anyData?.typeUrl) {
                        const typeName = anyData.typeUrl.replace("type.ankama.com/", "");
                        const type = proto.lookupType(typeName);
                        const decoded = type.decode(
                            Buffer.from(anyData.value ?? "", "base64") as any as Uint8Array,
                        );
                        const data = decoded.toJSON() as Record<string, any>;
                        addRaw(data, type);
                        const packetPayload = { typeName, data };
                        console.log(typeName);
                        BrowserWindow.getAllWindows().forEach((w) => {
                            if (w.isDestroyed()) return;
                            w.webContents.send("server-packet/" + typeName, packetPayload);
                            w.webContents.send("server-packet-broadcast", packetPayload);
                        });
                    }
                } catch (e) {
                    console.log(
                        "error",
                        e,
                        Buffer.from(packet, "hex").subarray(frameStart, frameEnd),
                    );
                    if (frameEnd === frameStart) {
                        reader.pos = frameStart;
                        break;
                    }
                }
                reader.pos = frameEnd;
            }
            serverReassemblyBuffer = serverReassemblyBuffer.subarray(reader.pos);
        },
    });

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(configDir);
    });
});

app.on("window-all-closed", () => {
    // App lifecycle is tied to the main window's "closed" event.
});
