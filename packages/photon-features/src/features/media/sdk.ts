import { metadataSchema, type SourceMetadata } from "./metadata.js";
import type { Attachment, Content, SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { assertScope, sameScope, type ResourceResolver, type Scope, type TrustedContext, type TransactionStore, type ResourceRef } from "../../index.js";
import { abortable, MAX_MEDIA_BYTES, mediaName, reject, validMime } from "./safety.js";
import type { NativeMediaSource } from "./staging.js";

/** Public SDK probe and adapter: uses the host's existing Spectrum instance. */
export interface NativeAttachmentProvider {
  getAttachment(guid: string, phone?: string): Promise<Attachment | undefined>;
}
export function mediaProvider(app: SpectrumInstance): NativeAttachmentProvider {
  const provider = imessage(app);
  return { getAttachment: (guid, phone) => provider.getAttachment(guid, phone) };
}
export interface ScopedMediaBinding {
  scope: Scope;
  phone: string;
  conversationId: string;
  provider: Pick<ReturnType<typeof mediaProvider>, "getAttachment">;
}
export type MediaBindings = (context: TrustedContext) => Promise<ScopedMediaBinding>;
function containsAttachment(content: Content, id: string, depth = 0): boolean {
  if (depth > 3) return false;
  if (content.type === "attachment" || content.type === "voice") return content.id === id;
  if (content.type === "group") return content.items.some(item => containsAttachment(item.content, id, depth + 1));
  if (content.type === "reply") return containsAttachment(content.content, id, depth + 1);
  return false;
}
export type NormalizedMediaLookup = (ref: Extract<ResourceRef, { kind: "attachment" }>, context: TrustedContext) => Promise<SourceMetadata | undefined>;
export function nativeMediaSource(resources: ResourceResolver, bindings: MediaBindings, store: TransactionStore, normalized?: NormalizedMediaLookup): NativeMediaSource {
  return {
    async open(ref, context, signal) {
      assertScope(ref, context.scope);
      const authoritative = await abortable(resources.resolve(ref, context), signal);
      if (authoritative.kind !== "attachment" || authoritative.id !== ref.id || authoritative.messageId !== ref.messageId) reject("attachment reference mismatch");
      assertScope(authoritative, context.scope);
      const mapping = mappedResource(ref, context, store);
      const parentRef = { version: 1 as const, kind: "message" as const, id: ref.messageId, scope: ref.scope };
      const parentMapping = mappedResource(parentRef, context, store);
      const spaceMapping = mappedResource({ version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope }, context, store);
      const parent = await abortable(resources.message({ version: 1, kind: "message", id: ref.messageId, scope: ref.scope }, context), signal);
      if (parent.platform !== "imessage" || parent.id !== parentMapping.providerId || parent.space.id !== spaceMapping.providerId) reject("attachment parent scope");
      const binding = await abortable(bindings(context), signal);
      if (!sameScope(binding.scope, context.scope) || !binding.phone || parent.space.id !== binding.conversationId || imessage(parent.space).phone !== binding.phone) reject("attachment line scope");
      const metadata = imessage(parent).attachmentMetadata?.find(item => item.guid === mapping.providerId);
      if (!metadata && !containsAttachment(parent.content, mapping.providerId)) reject("attachment absent from parent");
      const item: Attachment | undefined = await abortable(binding.provider.getAttachment(mapping.providerId, binding.phone), signal);
      if (!item || item.id !== mapping.providerId) reject("attachment unavailable");
      validMime(item.mimeType);
      mediaName(item.mimeType, item.name);
      if (item.size !== undefined && (item.size <= 0 || item.size > MAX_MEDIA_BYTES)) reject("byte limit");
      const incoming = normalized ? await abortable(normalized(ref, context), signal) : undefined;
      if (incoming) {
        metadataSchema.parse({ ...incoming, version: 1, stagingId: "00000000-0000-4000-8000-000000000000" });
        if (!incoming.source || !sameScope(incoming.source.scope, ref.scope) || incoming.source.id !== ref.id ||
          incoming.source.messageId !== ref.messageId || incoming.providerHandle !== mapping.providerId ||
          (incoming.providerMessageId !== undefined && incoming.providerMessageId !== parent.id) ||
          (incoming.providerConversationId !== undefined && incoming.providerConversationId !== parent.space.id) ||
          incoming.mimeType !== item.mimeType || (incoming.size !== undefined && item.size !== undefined && incoming.size !== item.size)) reject("normalized metadata mismatch");
      }
      const opening = item.stream();
      opening.then(stream => { if (signal.aborted) void stream.cancel().catch(() => {}); }).catch(() => {});
      const stream = await abortable(opening, signal);
      return { stream, metadata: { ...incoming, mimeType: item.mimeType, name: incoming?.name ?? item.name, size: item.size ?? incoming?.size,
        ...(parent.content.type === "voice" && parent.content.id === mapping.providerId ? { duration: parent.content.duration ?? incoming?.duration } : {}),
        source: ref, providerHandle: item.id, providerMessageId: parent.id, providerConversationId: parent.space.id } };
    },
  };
}

/** Logical F0 IDs are never passed to the SDK as provider IDs. */
export function mappedResource(ref: ResourceRef, context: TrustedContext, store: TransactionStore) {
  assertScope(ref, context.scope);
  const mapping = store.transaction(tx => tx.get("references", ref.id));
  if (!mapping || !sameScope(mapping.scope, context.scope) || !sameScope(mapping.reference.scope, context.scope) ||
    mapping.reference.kind !== ref.kind || mapping.reference.id !== ref.id ||
    (ref.kind === "attachment" && (mapping.reference.kind !== "attachment" || mapping.reference.messageId !== ref.messageId)) ||
    mapping.ownedByPrincipalId !== context.principalId || mapping.taskId !== context.taskId ||
    mapping.generation !== context.generation || !mapping.providerId) reject("resource mapping unavailable");
  return mapping;
}
