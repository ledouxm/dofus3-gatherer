import { z } from "zod";
import { desktopCapturer, clipboard } from "electron";
import { getWindows, keyboard, Key } from "@nut-tree-fork/nut-js";
import { router, publicProcedure } from "../trpc";

export const windowsRouter = router({
    getOpenWindows: publicProcedure.query(async () => {
        const wins = await getWindows();
        const withTitles = await Promise.all(wins.map(async (w) => ({ title: await w.title })));
        return withTitles.filter((w) => w.title && w.title.trim() !== "");
    }),

    focusWindowAndSend: publicProcedure
        .input(z.object({ title: z.string(), action: z.enum(["H", "travel"]) }))
        .mutation(async ({ input }) => {
            const wins = await getWindows();
            const entries = await Promise.all(wins.map(async (w) => ({ win: w, title: await w.title })));
            keyboard.config.autoDelayMs = 20;
            const target = entries.find((e) => e.title === input.title);
            if (!target) throw new Error(`Window not found: ${input.title}`);
            await target.win.focus();
            await new Promise((r) => setTimeout(r, 150));
            if (input.action === "H") {
                await keyboard.type(Key.H);
            } else {
                const clipText = clipboard.readText().trim();
                const travelText = clipText.startsWith("/travel") ? clipText : null;
                if (!travelText) throw new Error("Clipboard does not contain a valid /travel command");
                await keyboard.type(Key.Space);
                await new Promise((r) => setTimeout(r, 200));
                await keyboard.type(travelText);
                await keyboard.type(Key.Return);
            }
        }),

    getDesktopSources: publicProcedure.query(() =>
        desktopCapturer.getSources({ types: ["window", "screen"] }),
    ),
});
