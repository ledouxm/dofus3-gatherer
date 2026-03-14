import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../trpc";
import { steps, initEmitter, type InitStep } from "../initState";

export const initStatusRouter = router({
    get: publicProcedure.query(() => [...steps]),

    onChange: publicProcedure.subscription(() =>
        observable<InitStep[]>((emit) => {
            const handler = (s: InitStep[]) => emit.next(s);
            initEmitter.on("init-status", handler);
            return () => initEmitter.off("init-status", handler);
        }),
    ),
});
