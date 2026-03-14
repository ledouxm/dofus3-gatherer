import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../main/trpc/appRouter";

function getWsUrl(): string {
    if (import.meta.env.DEV) {
        const port = import.meta.env.VITE_TRPC_PORT ?? "8765";
        return `ws://${window.location.hostname}:${port}`;
    }
    // Production: renderer is served by the same HTTP server as the WS server
    return `ws://${window.location.host}`;
}

export const wsClient = createWSClient({ url: getWsUrl() });

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
    links: [wsLink({ client: wsClient })],
});
