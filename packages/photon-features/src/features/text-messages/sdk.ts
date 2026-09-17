import type { Message, Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  sameScope,
  type Scope,
  type TrustedContext,
  type Action,
  type ExecutionServices,
  type ContentCompiler,
  type ContentSpec,
} from "../../index.js";
import { requireThat, FeatureError } from "./errors.js";
export interface Binding {
  scope: Scope;
  phone: string;
  nativeSpaceId: string;
}
/** Host callbacks are trusted configuration, never action JSON. No client is created here. */
export interface TextMessageOptions {
  binding(context: TrustedContext, target?: Scope): Binding;
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

import { createHash } from "node:crypto";
import type { ContentInput } from "spectrum-ts";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import type { ProviderContext } from "../../contracts/transport.js";
import type { ResourceResolver } from "../../contracts/ports.js";
import type { OperationResult as PublicResult } from "../../contracts/results.js";
import type { ResourceRef } from "../../contracts/references.js";
import type { ReferenceRecord } from "../../state/ports.js";

/** Additive JSON on the shared reference row; never a serialized SDK handle or a second journal. */
export interface ReactionIdentity {
  version: 1;
  providerId: string;
  parentProviderId: string;
  parentNativeId: string;
  parentPartIndex: number | null;
  parentDirection: Message["direction"];
  spaceId: string;
  phone: string;
  direction: "outbound";
  emoji: string;
  nativeReaction:
    | import("spectrum-ts/providers/imessage").IMessageReactionRecord
    | null;
}
export type ReactionReferenceRecord = ReferenceRecord & {
  reactionIdentity?: ReactionIdentity;
};
export const REACTION_COLD_RECOVERY = "REACTION_COLD_RECOVERY_UNAVAILABLE";

/** Snapshot only public SDK identity. In particular multipart IDs must not be guessed from strings. */
export function reactionIdentity(message: Message): ReactionIdentity {
  requireThat(
    message.content.type === "reaction",
    "UNAVAILABLE",
    `${REACTION_COLD_RECOVERY}: public lookup did not return reaction content and its target handle.`,
  );
  requireThat(
    message.direction === "outbound",
    "FORBIDDEN",
    "Reaction is not outbound.",
  );
  const parent = imessage(message.content.target);
  requireThat(
    parent.direction === "inbound" || parent.direction === "outbound",
    "FORBIDDEN",
    "Reaction parent direction is unavailable.",
  );
  const native = imessage(message).reactionRecord;
  const parentNativeId = parent.parentId ?? parent.id;
  const parentPartIndex = parent.partIndex ?? null;
  if (native) {
    requireThat(
      native.selected !== false,
      "FORBIDDEN",
      "Reaction is no longer selected.",
    );
    requireThat(
      native.targetGuid === parentNativeId &&
        // A single-part target omits partIndex; native metadata can explicitly report its first part.
        (native.targetPartIndex ?? 0) === (parentPartIndex ?? 0),
      "SCOPE_MISMATCH",
      "Native reaction metadata differs from its content target.",
    );
    const emoji =
      native.reaction.kind === "emoji"
        ? native.reaction.emoji
        : tapbacks[native.reaction.kind as keyof typeof tapbacks];
    requireThat(
      emoji === message.content.emoji,
      "SCOPE_MISMATCH",
      "Native reaction metadata differs from its content emoji.",
    );
  }
  return {
    version: 1,
    providerId: message.id,
    parentProviderId: parent.id,
    parentNativeId,
    parentPartIndex,
    parentDirection: parent.direction,
    spaceId: message.space.id,
    phone: imessage(message.space).phone!,
    direction: "outbound",
    emoji: message.content.emoji,
    nativeReaction: native ? structuredClone(native) : null,
  };
}
/** Adapter for the shared compiler registry while its legacy signature is migrated by integration. */
export interface PublicContentCompiler {
  family: ContentSpec["type"];
  compile(spec: ContentSpec, services: PublicServices): Promise<ContentInput>;
}
/** Trusted host configuration. Reuse the one existing SDK owner and authoritative handle resolver. */
export interface PublicTextMessageOptions {
  streamDelivery?: "progressive" | "buffered";
  provider: ProviderContext;
  binding(context: TrustedContext, target?: Scope): Binding;
  resources: Pick<ResourceResolver, "space" | "message">;
  compilers?: () => readonly PublicContentCompiler[];
}
export function digestTextInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Stable parent identity; executeChild additionally scopes child keys to the runtime request. */
export function textResult(action: Action, s: PublicServices): PublicResult {
  return {
    version: 1,
    requestId: digestTextInput([
      s.context.scope,
      s.context.taskId,
      s.context.generation,
      s.context.principalId,
      action.idempotencyKey,
    ]),
    status: "executor-completed",
    revision: 0,
    updatedAt: s.clock.now(),
    references: [],
    observations: [],
  };
}
export function assertTextProvider(
  s: PublicServices,
  o: PublicTextMessageOptions,
): void {
  s.assertActiveClaim();
  requireThat(
    o.provider.provider === "imessage" &&
      sameScope(o.provider.scope, s.context.scope),
    "SCOPE_MISMATCH",
    "Provider scope differs from the authorized context.",
  );
  requireThat(
    o.provider.ready(),
    "UNAVAILABLE",
    "The existing provider owner is unavailable.",
  );
  requireThat(
    sameScope(o.binding(s.context).scope, s.context.scope),
    "SCOPE_MISMATCH",
    "Binding scope differs from context.",
  );
}
/** Check native chat and serving phone as well as the logical scope. */
export function checkPublicSpace(
  space: Space,
  s: PublicServices,
  o: PublicTextMessageOptions,
  target: Scope = s.context.scope,
): void {
  assertTextProvider(s, o);
  const b = o.binding(s.context, target);
  requireThat(
    space.__platform === "imessage",
    "UNSUPPORTED",
    "Cloud iMessage is required.",
  );
  requireThat(
    space.id === b.nativeSpaceId && imessage(space).phone === b.phone,
    "SCOPE_MISMATCH",
    "Wrong SDK chat or serving phone.",
  );
}
/** Capture actual SDK-returned handles only; void results never create replacement IDs. */
export function mapTextMessageOperation(
  action: Action,
  s: PublicServices,
  o: PublicTextMessageOptions,
  returned: Message | Message[] | void,
  reactionParent?: string,
): PublicResult {
  const result = textResult(action, s);
  const args = action.arguments;
  const target = "space" in args ? args.space.scope : "message" in args ? args.message.scope : "reaction" in args ? args.reaction.scope : s.context.scope;
  const envelopes =
    returned === undefined
      ? []
      : Array.isArray(returned)
        ? returned
        : [returned];
  // Spectrum returns grouped member handles inside a single group envelope. Preserve their real IDs
  // after the opaque call completes without claiming per-member dispatch/recovery checkpoints.
  const messages = envelopes.flatMap((message) => {
    checkPublicSpace(message.space, s, o, target);
    requireThat(
      message.platform === "imessage" && message.direction === "outbound",
      "SCOPE_MISMATCH",
      "SDK returned an invalid envelope.",
    );
    return message.content.type === "group" ? message.content.items : [message];
  });
  requireThat(
    messages.length <= 128,
    "UNSUPPORTED",
    "SDK returned too many message handles.",
  );
  if (reactionParent)
    requireThat(
      messages.length === 1,
      "UNAVAILABLE",
      "SDK did not return one reaction handle.",
    );
  for (const message of messages) {
    checkPublicSpace(message.space, s, o, target);
    requireThat(
      message.platform === "imessage" &&
        message.direction === "outbound" &&
        !!message.id,
      "SCOPE_MISMATCH",
      "SDK returned an invalid outbound handle.",
    );
    if (reactionParent) {
      requireThat(
        message.content.type === "reaction",
        "UNSUPPORTED",
        "SDK did not return an actual reaction handle.",
      );
      const parent = s.transaction((unit) =>
        unit.get("references", reactionParent),
      );
      checkPublicSpace(message.content.target.space, s, o, target);
      requireThat(
        parent &&
          sameScope(parent.scope, target) &&
          parent.providerId === message.content.target.id &&
          message.content.target.platform === "imessage",
        "SCOPE_MISMATCH",
        "SDK returned a reaction to another parent.",
      );
      requireThat(
        action.operation === "message.react" &&
          message.content.emoji === tapbacks[action.arguments.reaction],
        "SCOPE_MISMATCH",
        "SDK returned a different reaction.",
      );
    }
    const identity = reactionParent ? reactionIdentity(message) : undefined;
    const id = digestTextInput([
      target,
      message.id,
      reactionParent ?? "message",
    ]);
    const ref: ResourceRef = reactionParent
      ? {
          version: 1,
          kind: "reaction",
          id,
          scope: target,
          messageId: reactionParent,
        }
      : { version: 1, kind: "message", id, scope: target };
    s.transaction((unit) => {
      const prior = unit.get("references", id);
      if (prior) {
        requireThat(
          prior.providerId === message.id &&
            prior.ownedByPrincipalId === s.context.principalId,
          "FORBIDDEN",
          "Returned resource conflicts with its stored owner.",
        );
        if (identity)
          requireThat(
            digestTextInput(
              (prior as ReactionReferenceRecord).reactionIdentity ?? null,
            ) === digestTextInput(identity),
            "SCOPE_MISMATCH",
            "Returned reaction conflicts with stored identity.",
          );
      } else {
        const record: ReactionReferenceRecord = {
          id,
          reference: ref,
          scope: ref.scope,
          providerId: message.id,
          ownedByPrincipalId: s.context.principalId,
          taskId: s.context.taskId,
          generation: s.context.generation,
          revision: 0,
          ...(identity ? { reactionIdentity: identity } : {}),
        };
        unit.put("references", record, null);
      }
    });
    result.references.push(ref);
  }
  if (messages.length) {
    result.status = "provider-accepted";
    result.observations.push({
      kind: "accepted",
      source: "sdk-return",
      at: s.clock.now(),
    });
  } else result.value = { type: "void" };
  return result;
}
/** Consequential calls cross exactly one shared child boundary. Unknown outcomes belong to that runtime. */
export async function executeTextChild(
  action: Action,
  s: PublicServices,
  o: PublicTextMessageOptions,
  index: number,
  input: unknown,
  dispatch: () => Promise<Message | Message[] | void>,
  reactionParent?: string,
): Promise<PublicResult> {
  s.assertActiveClaim();
  return s.executeChild({
    index,
    key: `${textResult(action, s).requestId}:${index}`,
    argumentsDigest: digestTextInput([
      action.operation,
      action.arguments,
      input,
    ]),
    dispatch: async (signal) => {
      s.assertActiveClaim();
      if (signal.aborted) throw new Error("CANCELLED");
      return mapTextMessageOperation(
        action,
        s,
        o,
        await dispatch(),
        reactionParent,
      );
    },
  });
}

/** Preserve already-recorded child progress when a later pre-dispatch check fails. */
export function textFailure(base: PublicResult, error: unknown): PublicResult {
  const coldRecovery =
    error instanceof FeatureError &&
    error.message.startsWith(`${REACTION_COLD_RECOVERY}:`);
  const allowed = [
    "SCOPE_MISMATCH",
    "STALE_FENCE",
    "STALE_GENERATION",
    "CANCELLED",
    "FORBIDDEN",
    "RESOURCE_NOT_FOUND",
    "IDEMPOTENCY_CONFLICT",
    "CONTEXT_EXPIRED",
    "CONTEXT_REVOKED",
  ];
  const code: NonNullable<PublicResult["error"]>["code"] =
    error instanceof FeatureError
      ? error.code
      : error instanceof Error && allowed.includes(error.message)
        ? (error.message as NonNullable<PublicResult["error"]>["code"])
        : error instanceof Error &&
            (error.name === "ZodError" ||
              /^(NON_JSON_|CYCLIC_JSON|CONTENT_TOO_DEEP|REQUEST_TOO_LARGE)/.test(
                error.message,
              ))
          ? "INVALID_REQUEST"
          : "UNAVAILABLE";
  return {
    ...base,
    status:
      code === "CANCELLED"
        ? "cancelled"
        : code === "UNKNOWN_OUTCOME"
          ? "unknown-outcome"
          : ["UNSUPPORTED", "UNAVAILABLE", "RESOURCE_NOT_FOUND"].includes(code)
            ? "blocked"
            : "failed",
    error: {
      code,
      message: coldRecovery
        ? error.message
        : "WT-03 validation or authoritative resource resolution failed.",
      retry: code === "UNKNOWN_OUTCOME" ? "reconcile-first" : "never",
      ...(coldRecovery ? { blockerId: REACTION_COLD_RECOVERY } : {}),
    },
  };
}
