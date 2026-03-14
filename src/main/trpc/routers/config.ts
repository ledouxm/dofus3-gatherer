import { z } from "zod";
import path from "node:path";
import { promises as fs } from "fs";
import { router, publicProcedure } from "../trpc";
import { serverContext } from "../serverContext";

async function readConfig(filename: string): Promise<any> {
    const configPath = resolveConfigPath(filename);
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function writeConfig(filename: string, config: any): Promise<void> {
    const configPath = resolveConfigPath(filename);
    await fs.mkdir(serverContext.configDir, { recursive: true }).catch(() => {});
    let existing: any = {};
    try {
        existing = JSON.parse(await fs.readFile(configPath, "utf-8"));
    } catch {}
    await fs.writeFile(configPath, JSON.stringify({ ...existing, ...config }, null, 2), "utf-8");
}

function resolveConfigPath(filename: string): string {
    const configDir = serverContext.configDir;
    const resolved = path.resolve(configDir, filename);
    if (!resolved.startsWith(configDir + path.sep)) {
        throw new Error(`Invalid config filename: "${filename}"`);
    }
    return resolved;
}

const harvestEntrySchema = z.object({
    resourceId: z.number(),
    quantity: z.number(),
    mapId: z.number().nullable(),
    timestamp: z.string(),
});

export const configRouter = router({
    get: publicProcedure
        .input(z.object({ filename: z.string().default("config.json") }))
        .query(({ input }) => readConfig(input.filename)),

    save: publicProcedure
        .input(
            z.object({
                config: z.record(z.unknown()),
                filename: z.string().default("config.json"),
            }),
        )
        .mutation(({ input }) => writeConfig(input.filename, input.config)),

    appendHarvestEntry: publicProcedure.input(harvestEntrySchema).mutation(async ({ input }) => {
        const harvestLogPath = path.join(serverContext.configDir, "harvest-log.jsonl");
        await fs.mkdir(serverContext.configDir, { recursive: true }).catch(() => {});
        await fs.appendFile(harvestLogPath, JSON.stringify(input) + "\n", "utf-8");
    }),

    readHarvestLog: publicProcedure.query(async () => {
        const harvestLogPath = path.join(serverContext.configDir, "harvest-log.jsonl");
        try {
            const raw = await fs.readFile(harvestLogPath, "utf-8");
            return raw
                .split("\n")
                .filter(Boolean)
                .map((line) => JSON.parse(line));
        } catch {
            return [];
        }
    }),
});
