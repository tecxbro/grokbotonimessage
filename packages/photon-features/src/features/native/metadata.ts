import { imessage } from "spectrum-ts/providers/imessage";
import type { Message } from "spectrum-ts";
import type { OperationResult } from "../../contracts/index.js";
import { nativeSpace, requireNative } from "./guards.js";
import type { NativeBinding } from "./sdk.js";

function time(date: Date | undefined): number | null {
  const value = date?.getTime();
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function metadata(message: Message, binding: NativeBinding, spaceId: string): OperationResult["value"] {
  requireNative(imessage.is(message), "UNSUPPORTED", "Cloud iMessage metadata is required.");
  nativeSpace(message.space, binding, spaceId);
  // F0's deliberate allowlist excludes native text, handles, attachments, secrets and raw rows.
  return { type: "metadata", sentAt: time(message.timestamp), editedAt: time(message.dateEdited),
    isFromMe: message.direction === "outbound" };
}
