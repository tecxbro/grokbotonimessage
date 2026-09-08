import { z } from "zod";
import { idSchema, scopeSchema } from "./resources.js";
import { operations } from "./actions.js";
export const principalSchema = z.strictObject({
  id: idSchema,
  osUid: z.number().int().nonnegative(),
  credentialId: idSchema,
  authenticatedAt: z.number().int().nonnegative(),
});
export type AuthenticatedPrincipal = z.infer<typeof principalSchema>;
export const contextSchema = z.strictObject({
  version: z.literal(1),
  contextId: idSchema,
  principalId: idSchema,
  scope: scopeSchema,
  taskId: idSchema,
  generation: z.number().int().nonnegative(),
  permissions: z
    .array(
      z.enum(
        operations as [
          (typeof operations)[number],
          ...(typeof operations)[number][],
        ],
      ),
    )
    .max(44),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  revokedAt: z.number().int().nonnegative().nullable(),
});
export type TrustedContext = z.infer<typeof contextSchema>;
