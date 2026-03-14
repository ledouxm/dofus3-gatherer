import { z } from "zod";
import path from "node:path";
import { promises as fs } from "fs";
import { dialog } from "electron";
import { router, publicProcedure } from "../trpc";
import { serverContext } from "../serverContext";

function resolveRecordingPath(filename: string): string {
    const recordingsDir = serverContext.recordingsDir;
    if (
        !filename.endsWith(".dfrec") ||
        filename.includes("/") ||
        filename.includes("\\") ||
        filename.includes("..")
    ) {
        throw new Error(`Invalid recording filename: "${filename}"`);
    }
    return path.join(recordingsDir, filename);
}

export const recordingsRouter = router({
    list: publicProcedure.query(async () => {
        try {
            const files = await fs.readdir(serverContext.recordingsDir);
            const results: { filename: string; metadata: { name: string; createdAt: string; durationMs: number } }[] = [];
            for (const file of files) {
                if (!file.endsWith(".dfrec")) continue;
                try {
                    const raw = await fs.readFile(path.join(serverContext.recordingsDir, file), "utf-8");
                    const parsed = JSON.parse(raw);
                    if (parsed?.metadata) results.push({ filename: file, metadata: parsed.metadata });
                } catch {}
            }
            results.sort((a, b) => new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime());
            return results;
        } catch {
            return [];
        }
    }),

    saveToDisk: publicProcedure
        .input(
            z.object({
                packets: z.array(z.object({ relativeMs: z.number() }).passthrough()),
                videoBase64: z.string().nullable(),
                name: z.string().optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const filename = `recording-${Date.now()}.dfrec`;
            const filePath = path.join(serverContext.recordingsDir, filename);
            const durationMs =
                input.packets.length > 0 ? Math.max(0, ...input.packets.map((p) => p.relativeMs)) : 0;
            const record = {
                packets: input.packets,
                videoBase64: input.videoBase64,
                metadata: {
                    name: input.name ?? `Recording ${new Date().toLocaleString()}`,
                    createdAt: new Date().toISOString(),
                    durationMs,
                },
            };
            await fs.writeFile(filePath, JSON.stringify(record), "utf-8");
            return filename;
        }),

    loadFromDisk: publicProcedure
        .input(z.object({ filename: z.string() }))
        .query(async ({ input }) => {
            const filePath = resolveRecordingPath(input.filename);
            try {
                const raw = await fs.readFile(filePath, "utf-8");
                return JSON.parse(raw);
            } catch {
                return null;
            }
        }),

    delete: publicProcedure.input(z.object({ filename: z.string() })).mutation(async ({ input }) => {
        const filePath = resolveRecordingPath(input.filename);
        await fs.unlink(filePath);
        return true;
    }),

    updateMetadata: publicProcedure
        .input(z.object({ filename: z.string(), updates: z.object({ name: z.string().optional() }) }))
        .mutation(async ({ input }) => {
            const filePath = resolveRecordingPath(input.filename);
            const raw = await fs.readFile(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            parsed.metadata = { ...parsed.metadata, ...input.updates };
            await fs.writeFile(filePath, JSON.stringify(parsed), "utf-8");
            return true;
        }),

    export: publicProcedure
        .input(z.object({ packets: z.array(z.unknown()), videoBase64: z.string().nullable() }))
        .mutation(async ({ input }) => {
            const { filePath } = await dialog.showSaveDialog({
                title: "Save Recording",
                defaultPath: `recording-${Date.now()}.dfrec`,
                filters: [{ name: "Dofus Recording", extensions: ["dfrec"] }],
            });
            if (!filePath) return false;
            await fs.writeFile(filePath, JSON.stringify(input), "utf-8");
            return true;
        }),

    import: publicProcedure.mutation(async () => {
        const { filePaths } = await dialog.showOpenDialog({
            title: "Load Recording",
            filters: [{ name: "Dofus Recording", extensions: ["dfrec"] }],
            properties: ["openFile"],
        });
        if (!filePaths[0]) return null;
        const raw = await fs.readFile(filePaths[0], "utf-8");
        return JSON.parse(raw);
    }),
});
