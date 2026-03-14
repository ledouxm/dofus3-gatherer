import { app, BrowserWindow, dialog } from "electron";
import { shell } from "electron/common";
import path from "path";
import { spawnSync, execSync } from "child_process";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { makeDofusSqliteDb } from "./db";
import { makeSniffer } from "./sniffer/sniffer";
import { initDofusProto } from "./init/dofus-proto";
import protobuf from "protobufjs";
import { promises as fs } from "fs";
import { ofetch } from "ofetch";
import { env } from "./env-vars";
import { startTrpcServer } from "./trpc/wsServer";
import { serverContext } from "./trpc/serverContext";
import { packetEmitter } from "./trpc/packetEmitter";
import { updateStep } from "./trpc/initState";
import { setAppRouterCallbacks } from "./trpc/routers/app";

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

async function syncLatestMappings(
    configDir: string,
    cdnBaseUrl: string,
): Promise<{ updated: boolean; mappings?: any; timestamp?: string }> {
    if (!cdnBaseUrl) {
        console.log("[mappings-sync] No CDN base URL, skipping.");
        return { updated: false };
    }
    try {
        console.log("[mappings-sync] Fetching from", `${cdnBaseUrl}/mappings/latest`);
        const remote = await ofetch(`${cdnBaseUrl}/mappings/latest`, {
            headers: { "User-Agent": "dofus3-gatherer" },
        });
        console.log("[mappings-sync] Remote response:", JSON.stringify(remote));
        if (!remote?.timestamp || !remote?.mappings) {
            console.log("[mappings-sync] Invalid response shape, skipping.");
            return { updated: false };
        }
        const config = await readMainConfig(configDir);
        const localTimestamp = config.mappingsTimestamp;
        console.log("[mappings-sync] Local timestamp:", localTimestamp, "/ Remote:", remote.timestamp);
        if (localTimestamp && localTimestamp >= remote.timestamp) {
            console.log("[mappings-sync] Already up to date.");
            return { updated: false };
        }
        const updatedConfig = {
            ...config,
            mappings: { ...(config.mappings ?? {}), ...remote.mappings },
            mappingsTimestamp: remote.timestamp,
        };
        await writeMainConfig(configDir, updatedConfig);
        console.log("[mappings-sync] Mappings updated to", remote.timestamp, ":", JSON.stringify(updatedConfig.mappings));
        return { updated: true, mappings: updatedConfig.mappings, timestamp: remote.timestamp };
    } catch (err) {
        console.error("[mappings-sync] Error:", err);
        return { updated: false };
    }
}

function createTravelWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 320,
        height: 300,
        show: false,
        frame: false,
        backgroundColor: "#0a0a0a",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "../preload/index.js"),
            sandbox: false,
        },
    });
    win.on("ready-to-show", () => win.show());
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        win.loadURL(process.env["ELECTRON_RENDERER_URL"] + "/travel-window.html");
    } else {
        win.loadURL("http://localhost:8765/travel-window.html");
    }
    return win;
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

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        mainWindow.loadURL("http://localhost:8765");
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
            if (input.type === "keyDown" && input.key === "F12") {
                if (window.webContents.isDevToolsOpened()) {
                    window.webContents.closeDevTools();
                } else {
                    window.webContents.openDevTools();
                }
            }
        });
    });

    const configDir = path.join(process.env.USER_DATA_PATH!, "config");
    const cacheDir = path.join(process.env.USER_DATA_PATH!, "cache");
    const recordingsDir = path.join(process.env.USER_DATA_PATH!, "recordings");
    await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
    await fs.mkdir(recordingsDir, { recursive: true }).catch(() => {});

    serverContext.configDir = configDir;
    serverContext.cacheDir = cacheDir;
    serverContext.recordingsDir = recordingsDir;

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

    // Travel window (singleton)
    let travelWindow: BrowserWindow | null = null;
    serverContext.travelWindow = null;
    const openTravelWindow = () => {
        if (travelWindow && !travelWindow.isDestroyed()) {
            travelWindow.focus();
            return;
        }
        travelWindow = createTravelWindow();
        serverContext.travelWindow = travelWindow;
        travelWindow.on("closed", () => {
            travelWindow = null;
            serverContext.travelWindow = null;
        });
    };
    // Start mappings sync in background (non-blocking)
    const cdnBaseUrl = existingConfig.cdnBaseUrl || env.VITE_CDN_BASE_URL || "";
    serverContext.cdnBaseUrl = cdnBaseUrl;
    const mappingsSyncPromise = syncLatestMappings(configDir, cdnBaseUrl);

    setAppRouterCallbacks({
        openTravelWindow,
        getMappingsSyncResult: () => mappingsSyncPromise,
    });

    // Start tRPC WebSocket server
    await startTrpcServer(is.dev ? undefined : path.join(__dirname, "../renderer"));

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

    let serverReassemblyBuffer = Buffer.alloc(0);

    makeSniffer({
        onServerReset: () => {
            serverReassemblyBuffer = Buffer.alloc(0);
        },
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
                        const rawBytes = Buffer.from(anyData.value ?? "", "base64") as any as Uint8Array;
                        const decoded = type.decode(rawBytes);
                        const rawData = decoded.toJSON() as Record<string, any>;

                        // Filter nullish values
                        const data: Record<string, any> = Object.fromEntries(
                            Object.entries(rawData).filter(([, v]) => v !== null && v !== undefined),
                        );

                        // Extract field order from raw bytes using protobuf wire format
                        const _order: string[] = [];
                        const _types: string[] = [];
                        const seen = new Set<string>();
                        try {
                            const orderReader = protobuf.Reader.create(rawBytes);
                            while (orderReader.pos < orderReader.len) {
                                const tag = orderReader.uint32();
                                const fieldNum = tag >>> 3;
                                const wireType = tag & 7;
                                const field = type.fieldsById[fieldNum];
                                if (field) {
                                    const jsonName = field.name;
                                    if (!seen.has(jsonName) && jsonName in data) {
                                        _order.push(jsonName);
                                        _types.push(field.type);
                                        seen.add(jsonName);
                                    }
                                }
                                orderReader.skipType(wireType);
                            }
                        } catch {
                            // partial _order/_types on malformed sub-fields; non-fatal
                        }

                        data._order = _order;
                        data._types = _types;
                        data._raw = Buffer.from(rawBytes).toString("hex");
                        const packetPayload = { typeName, data };
                        console.log(typeName);
                        packetEmitter.emit("packet", packetPayload);
                        packetEmitter.emit("packet/" + typeName, packetPayload);
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
