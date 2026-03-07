import { z } from "zod";

const schema = z.object({
    VITE_CDN_BASE_URL: z.string().optional(),
});

export const env = schema.parse(import.meta.env);
