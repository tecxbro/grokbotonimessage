import { attachment, type ContentBuilder } from "spectrum-ts";
import type { ContentSpec, ExecutionServices } from "../../index.js";
import { SafeMediaStager, type ResolvedMedia } from "./staging.js";
import { mediaName, validateBytes } from "./safety.js";

export async function resolveMedia(media: Extract<ContentSpec, { type: "attachment" }>["media"], services: ExecutionServices): Promise<ResolvedMedia> {
  services.signal.throwIfAborted();
  const resolved = services.media instanceof SafeMediaStager
    ? await services.media.resolveWithSignal(media, services.context, services.signal)
    : await services.media.resolve(media, services.context);
  validateBytes(resolved.bytes, resolved.mimeType);
  services.signal.throwIfAborted();
  return resolved;
}
export async function compileAttachment(media: Extract<ContentSpec, { type: "attachment" }>["media"], services: ExecutionServices): Promise<ContentBuilder> {
  const resolved = await resolveMedia(media, services);
  return attachment(Buffer.from(resolved.bytes), {
    id: "kind" in media ? media.id : media.stagingId,
    mimeType: resolved.mimeType, name: mediaName(resolved.mimeType, resolved.metadata?.name),
  });
}
