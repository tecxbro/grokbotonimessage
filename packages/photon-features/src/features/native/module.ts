import { UnsupportedError, type ContentInput } from "spectrum-ts";
import {
  parseAction, resultSchema, type Action, type ContentCompiler, type ExecutionServices,
  type FeatureModule, type Operation, type OperationResult, type ResourceRef,
} from "../../contracts/index.js";
import { checkBinding, checkContext, NativeError, nativeSpace, requireGroup, requireNative,
  resolveReference, validatedMembers } from "./guards.js";
import { getSpace, remember } from "./spaces.js";
import { retainImage, stagedImage } from "./appearance.js";
import { effectCompiler } from "./effects.js";
import { customCompiler } from "./custom-handlers.js";
import { metadata } from "./metadata.js";
import { checkMembership } from "./membership.js";
import type { NativeDependencies } from "./sdk.js";

export const nativeOperations = [
  "space.get", "space.create", "space.getName", "space.rename", "space.getMembers",
  "space.addMembers", "space.removeMembers", "space.leave", "space.getAvatar",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground",
  "account.shareContact", "effect.send", "metadata.get", "custom.send",
] as const satisfies readonly Operation[];
const groupOperations = new Set<Operation>([
  "space.getName", "space.rename", "space.getMembers", "space.addMembers", "space.removeMembers",
  "space.leave", "space.getAvatar", "space.setAvatar", "space.clearAvatar",
]);

/** Lane factory only. The aggregate registry and host activation remain WT-00 owned. */
export function createNativeModule(dependencies: NativeDependencies): FeatureModule {
  const effects = effectCompiler(dependencies.compilers);
  function guardedCompiler(compiler: ContentCompiler, operation: "effect.send" | "custom.send"): ContentCompiler {
    return { family: compiler.family, async compile(content, services) {
      const space: Extract<ResourceRef, { kind: "space" }> = {
        version: 1, kind: "space", id: services.context.scope.spaceId, scope: services.context.scope,
      };
      // The synthetic envelope is used only for common context/lease checks.
      // Content intent comes from a separate host authority, never this identifier.
      const action = parseAction({ version: 1, idempotencyKey: "native-content-check", contextId: services.context.contextId,
        operation, arguments: operation === "effect.send" ? { space, content } :
          { space, ...(content.type === "registered-custom" ? { codecId: content.codecId, resource: content.resource } : {}) } });
      checkContext(action, services);
      const binding = await dependencies.binding(services.context);
      checkBinding(binding, services, operation);
      if (operation === "custom.send") checkBinding(binding, services, "account.shareContact");
      try { await dependencies.authorizeContent(content, services.context); }
      catch { throw new NativeError("FORBIDDEN", "Explicit native content intent is required."); }
      const built = await compiler.compile(content, services);
      checkContext(action, services);
      return built;
    } };
  }
  const compilers = [guardedCompiler(effects, "effect.send"), guardedCompiler(customCompiler, "custom.send")];

  async function execute(input: Action, services: ExecutionServices): Promise<OperationResult> {
    const result: OperationResult = { version: 1, requestId: input.idempotencyKey, status: "executor-completed",
      revision: 0, updatedAt: services.clock.now(), references: [], observations: [], value: { type: "void" } };
    let dispatched = false;
    let resolving = false;
    try {
      const action = parseAction(input);
      requireNative(nativeOperations.includes(action.operation as typeof nativeOperations[number]), "INVALID_REQUEST", "Operation belongs to another lane.");
      checkContext(action, services);
      // Authorize the exact parsed action before any provider lookup or media resolution.
      try { await dependencies.authorizeIntent(action, services.context); }
      catch { throw new NativeError("FORBIDDEN", "Explicit authorized user intent is required."); }
      const binding = await dependencies.binding(services.context);
      checkBinding(binding, services, action.operation);
      checkContext(action, services);
      resolving = true;
      const dispatch = async <T>(fn: () => Promise<T>): Promise<T> => {
        checkContext(action, services);
        dispatched = true;
        return fn();
      };
      if (action.operation === "space.create") {
        const members = validatedMembers(action.arguments.members);
        if (members.length > 1) requireNative(binding.dedicated, "UNAVAILABLE", "Group creation requires an existing dedicated line.");
        requireNative(!members.includes(binding.phone), "INVALID_REQUEST", "Do not include the bot account in recipients.");
        if (action.arguments.name !== undefined) {
          requireNative(members.length > 1, "UNSUPPORTED", "A direct conversation cannot be named.");
          requireNative(services.context.permissions.includes("space.rename"), "FORBIDDEN", "Naming a new group requires rename permission.");
          checkBinding(binding, services, "space.rename");
        }
        const created = nativeSpace(await dispatch(() => binding.provider.space.create(
          members.length === 1 ? members[0]! : members, { phone: binding.phone })), binding);
        requireNative(created.type === (members.length > 1 ? "group" : "dm"), "SCOPE_MISMATCH", "Created conversation type mismatch.");
        result.references.push(remember("space", created.id, services, true));
        if (action.arguments.name !== undefined) await dispatch(() => created.rename(action.arguments.name!));
      } else {
        const ref = "space" in action.arguments ? action.arguments.space :
          { version: 1 as const, kind: "space" as const, id: services.context.scope.spaceId, scope: services.context.scope };
        if (action.operation === "metadata.get") await resolveReference(action.arguments.message, services);
        const space = await getSpace(ref, services, binding, () => checkContext(action, services));
        checkContext(action, services);
        if (groupOperations.has(action.operation)) requireGroup(space, binding);
        result.references.push(ref);
        async function send(content: ContentInput, expectsMessage: boolean) {
          // Build before dispatch so invalid builders never become ambiguous provider outcomes.
          const built = typeof content === "string" ? content : await content.build();
          const sent = await dispatch(() => space.send(typeof built === "string" ? built : { build: async () => built }));
          if (sent) {
            nativeSpace(sent.space, binding, space.id);
            result.references.push(remember("message", sent.id, services));
          } else if (expectsMessage) {
            throw new NativeError("UNKNOWN_OUTCOME", "The provider returned no message evidence.");
          }
        }
        switch (action.operation) {
          case "space.get": break;
          case "space.getName": result.value = { type: "name", name: (await space.getDisplayName()) ?? null }; break;
          case "space.rename": await dispatch(() => space.rename(action.arguments.name)); break;
          case "space.getMembers": result.value = { type: "members", members: (await space.getMembers()).map(user => user.id) }; break;
          case "space.addMembers": {
            const members = validatedMembers(action.arguments.members);
            requireNative(!members.includes(binding.phone), "INVALID_REQUEST", "The bot is already a participant.");
            await checkMembership(action.operation, members, space, binding);
            await dispatch(() => space.add(members)); break;
          }
          case "space.removeMembers": {
            const members = validatedMembers(action.arguments.members);
            requireNative(!members.includes(binding.phone), "FORBIDDEN", "Use the explicitly authorized leave operation for the bot account.");
            await checkMembership(action.operation, members, space, binding);
            await dispatch(() => space.remove(members)); break;
          }
          case "space.leave":
            await checkMembership(action.operation, [], space, binding);
            await dispatch(() => space.leave()); break;
          case "space.getAvatar": {
            const icon = await space.getAvatar();
            result.value = { type: "media", media: icon ? await retainImage(icon, services, dependencies) : null }; break;
          }
          case "space.setAvatar": {
            const image = await stagedImage(action.arguments.media, services);
            await dispatch(() => space.avatar(image.data, { mimeType: image.mimeType })); break;
          }
          case "space.clearAvatar": await dispatch(() => space.avatar("clear")); break;
          case "space.setBackground": {
            const image = await stagedImage(action.arguments.media, services);
            await dispatch(() => space.background(image.data, { mimeType: image.mimeType })); break;
          }
          case "space.clearBackground": await dispatch(() => space.background("clear")); break;
          case "account.shareContact": await dispatch(() => space.shareContactCard()); break;
          case "effect.send": await send(await effects.compile(action.arguments.content, services), true); break;
          case "metadata.get": {
            const message = await services.resources.message(action.arguments.message, services.context);
            result.value = metadata(message, binding, space.id);
            result.references.push(action.arguments.message); break;
          }
          case "custom.send": {
            checkBinding(binding, services, "account.shareContact");
            try {
              await dependencies.authorizeIntent({ ...action, operation: "account.shareContact", arguments: { space: action.arguments.space } }, services.context);
            } catch { throw new NativeError("FORBIDDEN", "Explicit native account sharing intent is required."); }
            await send(await customCompiler.compile({ type: "registered-custom", codecId: action.arguments.codecId,
              resource: action.arguments.resource }, services), false); break;
          }
          default: throw new NativeError("INVALID_REQUEST", "Operation belongs to another lane.");
        }
      }
      checkContext(action, services);
      result.updatedAt = services.clock.now();
      return resultSchema.parse(result);
    } catch (error) {
      const known = error instanceof NativeError ? error : error instanceof UnsupportedError ?
        new NativeError("UNSUPPORTED", "The provider does not support this operation.") : null;
      result.status = dispatched ? "unknown-outcome" : known?.code === "CANCELLED" ? "cancelled" :
        known?.code === "UNAVAILABLE" ? "blocked" : "failed";
      delete result.value;
      result.error = { code: dispatched ? "UNKNOWN_OUTCOME" : known?.code ?? (resolving ? "PROVIDER_FAILURE" : "INVALID_REQUEST"),
        message: dispatched ? "Native dispatch may have taken effect; reconcile before retrying." :
          known?.message ?? "Native operation could not be validated or resolved.",
        retry: dispatched ? "reconcile-first" : known?.code === "UNAVAILABLE" ? "safe-before-dispatch" : "never" };
      result.updatedAt = services.clock.now();
      return result;
    }
  }

  return {
    id: "native-imessage-v1", lane: "wt-07", mode: "production",
    handlers: nativeOperations.map(operation => ({ operation,
      execute: async (action, services) => {
        if (action.operation !== operation) throw new NativeError("INVALID_REQUEST", "Handler operation mismatch.");
        return execute(action, services);
      }, recoveryCodec: { id: "native-v1", version: 1 } })),
    compilers,
    // F0 has no group projection table. WT-02 owns durable normalization/inbox;
    // reads query the provider. No subscription or automatic reply is registered.
    reducers: [],
    recoveryCodecs: [{ id: "native-v1", version: 1,
      validate: checkpoint => checkpoint !== null && typeof checkpoint === "object" &&
        Object.keys(checkpoint).length === 1 && "version" in checkpoint && checkpoint.version === 1,
      reconcile: async () => "unknown" }],
    capabilities: nativeOperations.map(operation => ({ operation, providerSupport: "native",
      availability: { account: "unknown", conversation: "unknown", checkedAt: null },
      implementation: "implemented", direction: { inbound: "not-applicable", outbound: "implemented" },
      evidence: [
        { tier: "unit", reference: "docs/photon-features/evidence/wt-07/isolated-lane-tests.txt",
          observedAt: Date.parse("2026-09-09T03:24:37.802Z"), sdkVersion: "12.8.0" },
        { tier: "sdk-contract", reference: "docs/photon-features/evidence/wt-07/sources.json",
          observedAt: Date.parse("2026-09-09T03:24:35.999Z"), sdkVersion: "12.8.0" },
      ], sdkVersion: "12.8.0",
      sources: ["npm:spectrum-ts@12.8.0", "npm:@spectrum-ts/imessage@12.8.0"],
      blockers: ["Host authorization, scoped provider and capability bindings must be supplied; no live verification.",
        ...(operation === "space.getAvatar" ? ["Nonempty avatars require the host retention port absent from F0."] : []),
        ...(operation === "custom.send" ? ["Only native-account-contact-v1 is allowlisted; a host-registered resource is required."] : [])],
    })),
  };
}
