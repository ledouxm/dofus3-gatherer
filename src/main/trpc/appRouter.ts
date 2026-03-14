import { router } from "./trpc";
import { appRouter as appProcedures } from "./routers/app";
import { dbRouter } from "./routers/db";
import { configRouter } from "./routers/config";
import { packetsRouter } from "./routers/packets";
import { initStatusRouter } from "./routers/initStatus";
import { recordingsRouter } from "./routers/recordings";
import { guidesRouter } from "./routers/guides";
import { windowsRouter } from "./routers/windows";

export const appRouter = router({
    app: appProcedures,
    db: dbRouter,
    config: configRouter,
    packets: packetsRouter,
    initStatus: initStatusRouter,
    recordings: recordingsRouter,
    guides: guidesRouter,
    windows: windowsRouter,
});

export type AppRouter = typeof appRouter;
