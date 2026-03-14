import { z } from "zod";
import path from "node:path";
import { promises as fs } from "fs";
import { app, dialog } from "electron";
import { ofetch } from "ofetch";
import { router, publicProcedure } from "../trpc";

const GANYMEDE_API = "https://ganymede-app.com/api";

export const guidesRouter = router({
    readFolder: publicProcedure.input(z.object({ folderPath: z.string() })).query(async ({ input }) => {
        const entries: any[] = [];
        try {
            const allFiles = await fs.readdir(input.folderPath, { recursive: true });
            for (const f of allFiles) {
                const filePath = path.join(input.folderPath, f as string);
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
    }),

    readFile: publicProcedure.input(z.object({ filePath: z.string() })).query(async ({ input }) => {
        try {
            const raw = await fs.readFile(input.filePath, "utf-8");
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }),

    readConf: publicProcedure.input(z.object({ confPath: z.string() })).query(async ({ input }) => {
        try {
            const raw = await fs.readFile(input.confPath, "utf-8");
            const conf = JSON.parse(raw);
            const profileId = conf.profileInUse;
            const profile = conf.profiles?.find((p: any) => p.id === profileId) ?? conf.profiles?.[0];
            if (!profile) return null;
            return { progresses: profile.progresses ?? [], profileName: profile.name ?? "Player" };
        } catch {
            return null;
        }
    }),

    writeConf: publicProcedure
        .input(z.object({ confPath: z.string(), progresses: z.array(z.unknown()) }))
        .mutation(async ({ input }) => {
            const raw = await fs.readFile(input.confPath, "utf-8");
            const conf = JSON.parse(raw);
            const profileId = conf.profileInUse;
            const idx = conf.profiles?.findIndex((p: any) => p.id === profileId) ?? -1;
            const profileIdx = idx !== -1 ? idx : 0;
            if (conf.profiles?.[profileIdx]) {
                conf.profiles[profileIdx].progresses = input.progresses;
            }
            await fs.writeFile(input.confPath, JSON.stringify(conf, null, 2), "utf-8");
        }),

    fetchFromServer: publicProcedure
        .input(z.object({ status: z.string().optional() }))
        .query(({ input }) => {
            const url = input.status
                ? `${GANYMEDE_API}/v2/guides?status=${input.status}`
                : `${GANYMEDE_API}/v2/guides`;
            return ofetch(url, { headers: { "User-Agent": "dofus3-gatherer" } });
        }),

    downloadFromServer: publicProcedure
        .input(z.object({ guideId: z.number(), folderPath: z.string() }))
        .mutation(async ({ input }) => {
            const guide = await ofetch(`${GANYMEDE_API}/v2/guides/${input.guideId}`, {
                headers: { "User-Agent": "dofus3-gatherer" },
            });
            const dest = path.join(input.folderPath, `${input.guideId}.json`);
            await fs.writeFile(dest, JSON.stringify(guide, null, 2), "utf-8");
            return true;
        }),

    getDefaultGanymedePath: publicProcedure.query(async () => {
        const appData = app.getPath("appData");
        const candidate = path.join(appData, "com.ganymede.ganymede-app");
        try {
            await fs.access(path.join(candidate, "conf.json"));
            return candidate;
        } catch {
            return null;
        }
    }),

    pickGanymedeFolder: publicProcedure.mutation(async () => {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            title: "Sélectionner le dossier Ganymede",
            properties: ["openDirectory"],
        });
        return canceled || !filePaths[0] ? null : filePaths[0];
    }),
});
