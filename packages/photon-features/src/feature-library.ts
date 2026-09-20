/** Feature-only import surface for an existing Spectrum integration.
 * These are the unchanged feature factories and canonical contracts. Importing this
 * module does not create a connection, server, inbox, outbox, or process supervisor.
 * Factories need their real typed dependencies and authenticated ExecutionServices;
 * registration alone is not permission or evidence of provider availability.
 */
export { operations, operationArguments, parseActionRequest } from "./contracts/actions.js";
export type { ActionRequest, Operation } from "./contracts/actions.js";
export { parseContentSpec } from "./contracts/content.js";
export type { ContentSpec } from "./contracts/content.js";
export type { FeatureModule } from "./contracts/feature.js";
export type { ExecutionServices } from "./contracts/services.js";
export { registerFeatureModules } from "./registry/modules.js";
export { createFeatureModule as createTextFeatures } from "./features/text-messages/module.js";
export { createFeatureModule as createMediaFeatures } from "./features/media/module.js";
export { createFeatureModule as createPollFeatures } from "./features/polls/module.js";
export { createFeatureModule as createCardFeatures } from "./features/cards/module.js";
export { createPublicFeatureModule as createNativeFeatures } from "./features/native/module.js";
export { createTypingFeatureModule as createTypingFeatures } from "./runtime/typing/operations.js";
export { TypingLeases } from "./runtime/typing/leases.js";
