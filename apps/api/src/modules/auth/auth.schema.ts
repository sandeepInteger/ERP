import { z } from "zod";

export const DevLoginSchema = z.object({
  email: z.string().email(),
});

export type DevLoginBody = z.infer<typeof DevLoginSchema>;
