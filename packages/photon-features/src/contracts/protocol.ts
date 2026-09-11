import { z } from "zod";
import { actionSchema } from "./actions.js";
import { idSchema } from "./resources.js";
/** Only generated file basenames in the configured private import directory are accepted. */
export const mediaImportInputSchema = z.strictObject({
  filename: z.string().regex(/^[A-Za-z0-9_. -]{1,200}$/).refine(value => value !== "." && value !== ".."),
  metadata: z.strictObject({
    mimeType: z.string().min(1).max(100).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
    name: z.string().min(1).max(200).refine(value => !/[\x00-\x1f\x7f/\\]/.test(value)).optional(),
    duration: z.number().finite().nonnegative().optional(),
  }),
});
export type MediaImportInput = z.infer<typeof mediaImportInputSchema>;
export { stagedMediaSchema as mediaImportResultSchema } from "./content.js";
const work = { contextId: idSchema };
export const localRequestSchema = z.discriminatedUnion("method", [
  z.strictObject({ version: z.literal(1), method: z.literal("media.import"), ...work, ...mediaImportInputSchema.shape }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("submit"),
    action: actionSchema,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("status"),
    contextId: idSchema,
    requestId: idSchema,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("capabilities"),
    ...work,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("diagnostics"),
    ...work,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.list"),
    ...work,
    limit: z.number().int().min(1).max(100),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.claim"),
    ...work,
    handoffId: idSchema,
    leaseMs: z.number().int().min(1000).max(60000),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.heartbeat"),
    ...work,
    handoffId: idSchema,
    fence: z.number().int().nonnegative(),
    leaseMs: z.number().int().min(1000).max(60000),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.ack"),
    ...work,
    handoffId: idSchema,
    fence: z.number().int().nonnegative(),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("request.cancel"),
    ...work,
    requestId: idSchema,
  }),
]);
export type LocalRequest = z.infer<typeof localRequestSchema>;
