import { z } from "zod";
import { idSchema } from "../contracts/resources.js";
export const cardBackendConfigurationSchema = z.strictObject({
  kind: z.literal("signed-card-v1"), id: idSchema,
  origin: z.string().url().refine(value => new URL(value).protocol === "https:" && new URL(value).origin === value),
  port: z.number().int().min(1024).max(65535),
  participants: z.array(z.strictObject({
    id: idSchema,
    imessageAddress: z.string().min(3).max(254).refine(value => /^\+[1-9]\d{6,14}$/.test(value) ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "verified canonical iMessage phone number or email required"),
    publicKey: z.strictObject({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
    enrollmentEvidence: z.string().min(1).max(1000),
  })).max(64).refine(values => new Set(values.map(p => p.id)).size === values.length && new Set(values.map(p => p.publicKey.x)).size === values.length),
});
export type CardBackendConfiguration = z.infer<typeof cardBackendConfigurationSchema>;
