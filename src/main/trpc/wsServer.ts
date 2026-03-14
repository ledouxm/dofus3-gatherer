import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { WebSocketServer } from "ws";
import http from "node:http";
import { createRequire } from "node:module";
import { appRouter } from "./appRouter";

const TRPC_PORT = 8765;

export async function startTrpcServer(distRendererPath?: string): Promise<number> {
    const httpServer = http.createServer();

    if (distRendererPath) {
        // Dynamically require sirv (CJS) in case of ESM/CJS mismatch
        const require = createRequire(import.meta.url);
        const sirv = require("sirv");
        const serve = sirv(distRendererPath, { single: true });
        httpServer.on("request", serve);
    }

    const wss = new WebSocketServer({ server: httpServer });

    applyWSSHandler({
        wss,
        router: appRouter,
        createContext: () => ({}),
    });

    await new Promise<void>((resolve) =>
        httpServer.listen(TRPC_PORT, "0.0.0.0", resolve),
    );

    console.log(`[trpc] WebSocket server listening on ws://0.0.0.0:${TRPC_PORT}`);
    return TRPC_PORT;
}
