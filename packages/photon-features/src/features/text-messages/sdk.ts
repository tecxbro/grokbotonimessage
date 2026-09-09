import type { Message, Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  sameScope,
  type Scope,
  type TrustedContext,
  type Action,
  type ExecutionServices,
  type ContentCompiler,
} from "../../index.js";
import { requireThat } from "./errors.js";
export interface Binding {
  scope: Scope;
  phone: string;
  nativeSpaceId: string;
}
/** Host callbacks are trusted configuration, never action JSON. No client is created here. */
export interface TextMessageOptions {
  binding(context: TrustedContext): Binding;
  requestId(action: Action, services: ExecutionServices): string;
  compilers?: () => readonly ContentCompiler[];
}
export function checkSpace(
  space: Space,
  services: ExecutionServices,
  options: TextMessageOptions,
): void {
  const binding = options.binding(services.context);
  requireThat(
    sameScope(binding.scope, services.context.scope),
    "SCOPE_MISMATCH",
    "Host binding scope mismatch.",
  );
  requireThat(
    space.__platform === "imessage",
    "UNSUPPORTED",
    "Only the pinned cloud iMessage provider is supported.",
  );
  requireThat(
    space.id === binding.nativeSpaceId &&
      imessage(space).phone === binding.phone,
    "SCOPE_MISMATCH",
    "SDK conversation or serving line does not match the trusted binding.",
  );
}
export function checkMessage(
  message: Message,
  services: ExecutionServices,
  options: TextMessageOptions,
): void {
  requireThat(
    message.platform === "imessage",
    "UNSUPPORTED",
    "Target must be a cloud iMessage message.",
  );
  checkSpace(message.space, services, options);
  requireThat(
    message.direction === "inbound" || message.direction === "outbound",
    "FORBIDDEN",
    "Target direction is unavailable.",
  );
}
export const tapbacks = {
  love: "❤️",
  like: "👍",
  dislike: "👎",
  laugh: "😂",
  emphasize: "‼️",
  question: "❓",
} as const;
