import { generateInitialOwnerConfiguration, assertAbsent } from '../dist/src/host/setup-configuration.js';
export { sharedLogicalLineId } from '../dist/src/host/setup-configuration.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { authorityTransitionSchema } from '../dist/src/host/authority-admin.js';
import { streamProducerInputSchemas, localRequestSchema } from '../dist/src/contracts/protocol.js';
import { operations } from '../dist/src/contracts/actions.js';
import { productionHostConfigurationSchema, normalizedHostConfigurationSchema, assertPrivateDirectory } from '../dist/src/host/configuration.js';
import { administrativeOperations, upstreamPollOperations, configurationBlockers } from '../dist/src/host/configuration-inventory.js';

// Legacy v1 examples only. Normal product setup uses discovery and full-owner grants.
const administrative = new Set([...administrativeOperations, 'custom.send']);
const supported = operations.filter(op => !upstreamPollOperations.includes(op));
export const profiles = Object.freeze({
  'minimal-text': ['typing.begin', 'typing.end', 'text.send', 'message.get', 'message.reply', 'message.markRead'],
  messaging: supported.filter(op => !administrative.has(op)),
  administrative: supported,
});
const inputSchema = z.strictObject({ version: z.literal(1), profile: z.enum(Object.keys(profiles)),
  enable: z.array(z.enum(operations)).min(1).refine(items => new Set(items).size === items.length),
  configuration: z.unknown(),
});
/** v1 stays synchronous for legacy callers; v2 discovery input returns a Promise.
 * Always await this entry point in the product setup/lifecycle path. */
export function generateConfiguration(input) {
  if (input?.version === 2) return generateInitialOwnerConfiguration(input);
  const parsed = inputSchema.parse(input);
  if (parsed.enable.some(op => !profiles[parsed.profile].includes(op))) throw new Error('OPERATION_OUTSIDE_PROFILE');
  // Require a schema-valid owner-authored baseline so recipients, native-content
  // intent, identifiers, time limits, backend and filesystem roots are explicit.
  const baseline = productionHostConfigurationSchema.parse(parsed.configuration);
  if (parsed.enable.some(op => !baseline.task.permissions.includes(op))) throw new Error('EXPLICIT_TASK_GRANT_REQUIRED');
  const configuration = productionHostConfigurationSchema.parse({ ...baseline, activation: 'disabled',
    task: { ...baseline.task, permissions: parsed.enable },
    provider: { ...baseline.provider, availableOperations: parsed.enable },
    authorization: { ...baseline.authorization,
      administrativeOperations: baseline.authorization.administrativeOperations.filter(op => parsed.enable.includes(op)) },
  });
  const blockers = configurationBlockers(configuration);
  for (const op of parsed.enable) if (blockers[op]?.length) throw new Error(op + ': ' + blockers[op].join(' '));
  return configuration;
}
export async function generateProfiles(check = false, { schemas: includeSchemas = true } = {}) {
  const directory = new URL('../examples/profiles/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, allowedOperations] of Object.entries(profiles)) {
    const content = JSON.stringify({ version: 1, legacy: true, profile: name, allowedOperations,
      defaultEnabledOperations: [], explicitOwnerSelectionRequired: true,
      upstreamReleaseBlockers: upstreamPollOperations,
      note: 'Legacy v1 compatibility example only. Normal setup consumes discovery with version 2 input and full-owner grants; generation does not activate.' }, null, 2) + '\n';
    const target = new URL(name + '.json', directory);
    if (check) { if (await readFile(target, 'utf8') !== content) throw new Error('PROFILE_DRIFT'); }
    else await writeFile(target, content);
  }
  const schemas = { 'host-configuration-v2': productionHostConfigurationSchema, 'host-configuration-v3': normalizedHostConfigurationSchema, 'authority-transition-v1': authorityTransitionSchema,
    protocol: localRequestSchema, ...streamProducerInputSchemas };
  for (const [name, schema] of Object.entries(includeSchemas ? schemas : {})) {
    const target = new URL('../schemas/' + name + '.json', import.meta.url);
    const content = JSON.stringify(z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'throw' }), null, 2) + '\n';
    if (check) { if (await readFile(target, 'utf8') !== content) throw new Error('CONFIGURATION_SCHEMA_DRIFT'); }
    else await writeFile(target, content);
  }
  return { profiles: Object.keys(profiles).length, registryOperations: operations.length, supportedOperations: supported.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--profiles', '--check'].includes(args[0])) console.log(JSON.stringify(await generateProfiles(args[0] === '--check')));
    else {
      if (args.length !== 2) throw new Error('USAGE_INPUT_JSON_OUTPUT_JSON');
      await assertAbsent(resolve(args[1]));
      await assertPrivateDirectory(dirname(resolve(args[1])));
      const config = await generateConfiguration(JSON.parse(await readFile(args[0], 'utf8')));
      await writeFile(args[1], JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ generated: args[1], activation: 'disabled', activateAfterValidation: config.activateAfterValidation ?? false, operations: config.task.permissions.length }));
    }
  } catch (error) { console.error('Configuration generation failed: ' + error.message); process.exitCode = 1; }
}
