import { z } from "zod";
import {
  attachmentRefSchema,
  cardRefSchema,
  idSchema,
  messageRefSchema,
} from "./resources.js";
export const proseSchema = z.string().min(1).max(16000);
export const httpsSchema = z
  .string()
  .max(2048)
  .url()
  .regex(/^https:\/\//);
// Media is always a host-owned staged resource. A caller cannot supply a path or fetch URL.
export const stagedMediaSchema = z.strictObject({
  stagingId: idSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z
    .string()
    .max(100)
    .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});
export const mediaSchema = z.union([stagedMediaSchema, attachmentRefSchema]);
export const contactSchema = z.strictObject({
  name: z.string().min(1).max(200),
  phones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).max(10),
  emails: z.array(z.string().email().max(254)).max(10),
});
export const pollChoiceSchema = z.strictObject({
  key: idSchema,
  label: z.string().min(1).max(200),
});
export const cardLayoutSchema = z.strictObject({
  caption: z.string().max(300),
  subcaption: z.string().max(300).optional(),
  image: mediaSchema.optional(),
});
export const leafContentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: proseSchema }),
  z.strictObject({ type: z.literal("markdown"), text: proseSchema }),
  z.strictObject({
    type: z.literal("link"),
    url: httpsSchema,
    title: z.string().max(300).optional(),
  }),
  z.strictObject({ type: z.literal("attachment"), media: mediaSchema }),
  z.strictObject({ type: z.literal("voice"), media: mediaSchema }),
  z.strictObject({ type: z.literal("contact"), contact: contactSchema }),
  z.strictObject({
    type: z.literal("poll"),
    question: z.string().min(1).max(500),
    options: z.array(pollChoiceSchema).min(2).max(12),
  }),
  z.strictObject({
    type: z.literal("app"),
    templateId: idSchema,
    url: httpsSchema,
    layout: cardLayoutSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("registered-custom"),
    codecId: idSchema,
    resource: cardRefSchema,
  }),
]);
// Finite composition: at most 16 groups of 8 leaves. Wrappers cannot wrap wrappers.
export const groupContentSchema = z.strictObject({
  type: z.literal("group"),
  items: z.array(leafContentSchema).min(1).max(8),
});
export const contentSchema = z.union([
  leafContentSchema,
  groupContentSchema,
  z.strictObject({
    type: z.literal("compose"),
    items: z
      .array(z.union([leafContentSchema, groupContentSchema]))
      .min(1)
      .max(16),
  }),
  z.strictObject({
    type: z.literal("reply"),
    message: messageRefSchema,
    content: leafContentSchema,
  }),
  z.strictObject({
    type: z.literal("effect"),
    effect: z.enum([
      "slam",
      "loud",
      "gentle",
      "invisible-ink",
      "confetti",
      "balloons",
      "fireworks",
      "lasers",
      "celebration",
      "echo",
      "spotlight",
      "love",
      "shooting-star",
    ]),
    content: leafContentSchema,
  }),
]);
export type ContentSpec = z.infer<typeof contentSchema>;
export const voicePolicy = Object.freeze({
  version: 1,
  targetBubbleCharacters: 120,
  preferredMaximumCharacters: 150,
  blankLines: "complete thoughts",
  casing: "natural lowercase; preserve names/acronyms/code",
  splitting: "never arbitrarily split sentences, URLs, paths, commands or code",
  questionsPerTurn: 1,
  emDashes: false,
  tone: "friend-like, not customer support",
  structuredPayloads: "bypass prose formatting",
  formatterOwner: "wt-03",
  orchestratorGuidanceOwner: "wt-08",
});
