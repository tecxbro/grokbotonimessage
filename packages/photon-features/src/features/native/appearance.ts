import { createHash } from "node:crypto";
import { stagedMediaSchema, type ExecutionServices } from "../../contracts/index.js";
import { NativeError, requireNative, resolveReference } from "./guards.js";
import type { NativeDependencies, StagedMedia, StoredMedia } from "./sdk.js";

export function validateImage(image: { bytes: Uint8Array; mimeType: string }): void {
  requireNative(image.bytes.byteLength > 0 && image.bytes.byteLength <= 25 * 1024 * 1024 &&
    ["image/png", "image/jpeg", "image/heic", "image/heif"].includes(image.mimeType),
  "MEDIA_REJECTED", "A guarded image of at most 25 MiB is required.");
}
export async function stagedImage(media: StagedMedia, services: ExecutionServices) {
  if ("kind" in media) await resolveReference(media, services);
  const image = await services.media.resolve(media, services.context).catch(() => {
    throw new NativeError("MEDIA_REJECTED", "The common media stager rejected this image.");
  });
  validateImage(image);
  // The common stager owns byte sniffing/decoding and resource retention.
  if ("stagingId" in media) requireNative(image.mimeType === media.mimeType && image.bytes.byteLength === media.bytes &&
    createHash("sha256").update(image.bytes).digest("hex") === media.sha256,
  "MEDIA_REJECTED", "Staged image integrity mismatch.");
  return { data: Buffer.from(image.bytes), mimeType: image.mimeType };
}
export async function retainImage(
  image: { data: Buffer; mimeType: string }, services: ExecutionServices, dependencies: NativeDependencies,
): Promise<StoredMedia> {
  requireNative(dependencies.retainAvatar, "UNAVAILABLE", "The host avatar retention port is required.");
  const input = { bytes: image.data, mimeType: image.mimeType };
  validateImage(input);
  const retained = stagedMediaSchema.parse(await dependencies.retainAvatar(input, services));
  requireNative(retained.bytes === image.data.byteLength && retained.mimeType === image.mimeType &&
    retained.sha256 === createHash("sha256").update(image.data).digest("hex"),
  "MEDIA_REJECTED", "Retained avatar integrity mismatch.");
  return retained;
}
