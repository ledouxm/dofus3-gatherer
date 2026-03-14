import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { getDb } from "../../db";

export const dbRouter = router({
    sql: publicProcedure
        .input(
            z.object({
                sql: z.string(),
                parameters: z.array(z.unknown()).optional(),
                query: z.unknown().optional(),
            }).passthrough(),
        )
        .mutation(({ input }) => getDb().executeQuery(input as any)),
});
