import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { check, selected, exists, privateWrite, ensureLauncher } from './common.mjs';

export async function bindWebhook(root, input) {
  const release = await selected(root), { grokWebhookBindingSchema } = await release.load('host/grok-webhook');
  let binding; try { binding = grokWebhookBindingSchema.parse(input); } catch { throw new Error('INVALID_GROK_WEBHOOK_BINDING'); }
  const { readPrivateFile, assertPrivateDirectory } = await release.load('host/configuration');
  await assertPrivateDirectory(join(root, 'runtime'));
  const path = join(root, 'runtime', 'grok-wake.json');
  if (await exists(path)) {
    let saved; try { saved = grokWebhookBindingSchema.parse(JSON.parse(await readPrivateFile(path, 16384))); }
    catch { throw new Error('INVALID_GROK_WEBHOOK_BINDING'); }
    check(JSON.stringify(saved) === JSON.stringify(binding), 'EXISTING_WEBHOOK_REQUIRES_EXPLICIT_MIGRATION');
  } else await privateWrite(path, binding);
  return { configured: true, authentication: 'stored-privately', routineVerified: false };
}

/** Discovery remains Photon-only. Native Grok registration uses the bot's actual
 * exposed routine tool and the supplied ROUTINE.md, not an invented private API. */
export async function connect(root, { address, projectId } = {}, services = {}) {
  const release = await selected(root), configPath = join(root, 'runtime', 'configuration.json');
  const { loadNormalizedHostConfiguration } = await release.load('host/configuration');
  const { validateProductionInstallation, changeProductionActivation } = await release.load('host/process');
  if (await exists(configPath)) {
    const config = await loadNormalizedHostConfiguration(root);
    check(config.grok.mode === 'webhook', 'EXISTING_INSTALLATION_REQUIRES_MIGRATION');
    check((!projectId || config.provider.projectId === projectId) &&
      (!address || config.provider.initialAddress?.toLowerCase() === address.toLowerCase()), 'EXISTING_IDENTITY_MISMATCH');
    const validation = await validateProductionInstallation(root, release.releaseRoot);
    if (validation.activation !== 'enabled') await changeProductionActivation(root, release.releaseRoot, 'enabled');
    await ensureLauncher(root);
    return { configured: true, reused: true, activation: 'enabled', next: 'start', operationBlockers: validation.operationBlockers };
  }
  const webhookFile = join(root, 'runtime', 'grok-wake.json');
  const { readGrokWebhookBinding } = await release.load('host/grok-webhook');
  await readGrokWebhookBinding(webhookFile);
  const { setupDiscovery } = await release.load('cli/setup');
  const discovery = await setupDiscovery({ installationRoot: root, projectId, wakeMode: 'webhook' }, services);
  // Select an enrolled user by the requested real handle, never by an internal bot ID.
  if (address) {
    const users = discovery.spectrum.userCandidates.filter(row => [row.phoneNumber, row.email].some(value => value?.toLowerCase() === address.toLowerCase()));
    check(users.length <= 1, 'AMBIGUOUS_ENROLLED_SENDER');
    discovery.spectrum.user = users[0] ?? null;
    if (users.length === 1) discovery.unresolved = discovery.unresolved.filter(value => value !== 'spectrum.user');
    else if (!discovery.unresolved.includes('spectrum.user')) discovery.unresolved.push('spectrum.user');
  }
  if (discovery.unresolved.length) return { configured: false, status: 'needs-input', unresolved: discovery.unresolved,
    projectCandidates: discovery.projectCandidates, users: discovery.spectrum.userCandidates,
    photonExecutable: discovery.photon.executable, photonConfigDirectory: join(root, 'runtime/setup/photon-config'),
    next: !discovery.projectCandidates.length ? 'Create a Spectrum-enabled project with account project.create, then rerun connect.' :
      !discovery.spectrum.userCandidates.length ? 'Enroll the intended sender with account user.add, then rerun connect.' :
      'Resolve the listed Photon account/resource selection and rerun connect; do not rotate secrets or create a dedicated line.' };
  const { generateInitialOwnerConfiguration, writeInitialConfiguration } = await release.load('host/setup-configuration');
  const config = await generateInitialOwnerConfiguration({ version: 2, discovery, webhookFile,
    choices: { ...(projectId ? { projectId } : {}), ...(address ? { initialAddress: address } : {}) }, activateAfterValidation: false });
  await writeInitialConfiguration(root, config);
  await validateProductionInstallation(root, release.releaseRoot);
  await changeProductionActivation(root, release.releaseRoot, 'enabled');
  await ensureLauncher(root);
  return { configured: true, activation: 'enabled', next: 'start', registeredOperations: config.task.permissions.length,
    liveVerified: false, dedicated: config.provider.dedicated };
}

/** Typed prerequisite operations. No billing, secret rotation, invite, arbitrary
 * CLI flags, endpoint override or alternate access token is accepted. */
export function accountArguments(input) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_ACCOUNT_INPUT');
  const nonempty = key => { check(typeof input[key] === 'string' && input[key].trim() && input[key].length <= 254 && !/[\x00-\x1f]/.test(input[key]), 'INVALID_ACCOUNT_INPUT'); return input[key]; };
  const keys = allowed => check(Object.keys(input).every(key => allowed.includes(key)), 'UNKNOWN_ACCOUNT_FIELD');
  if (input.operation === 'project.create') {
    keys(['operation','name','location']);
    return ['projects','create','--name',nonempty('name'),'--platforms','imessage',
      ...(input.location !== undefined ? ['--location',nonempty('location')] : []),'--json'];
  }
  if (input.operation === 'user.add') {
    keys(['operation','projectId','firstName','lastName','email','phone']);
    check(/^\+[1-9]\d{1,14}$/.test(input.phone) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email), 'INVALID_ENROLLMENT_CONTACT');
    return ['spectrum','users','add','--project',nonempty('projectId'),'--first-name',nonempty('firstName'),
      '--last-name',nonempty('lastName'),'--email',nonempty('email'),'--phone',nonempty('phone'),'--json'];
  }
  if (input.operation === 'imessage.enable') {
    keys(['operation','projectId']); return ['spectrum','platforms','enable','imessage','--project',nonempty('projectId'),'--json'];
  }
  throw new Error('ACCOUNT_COMMAND_NOT_ALLOWED');
}
export function accountResult(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'PHOTON_ACCOUNT_OUTCOME_UNKNOWN');
  const clean = {};
  for (const key of ['id','name','firstName','lastName','email','phoneNumber'])
    if (typeof value[key] === 'string' && value[key].length <= 254) clean[key] = value[key];
  if (typeof value.warning?.code === 'string' && /^[a-z_]{1,100}$/.test(value.warning.code)) clean.warning = value.warning.code;
  return { completed: true, result: clean, next: 'connect' };
}
export async function account(root, input) {
  const args = accountArguments(input), release = await selected(root), { setupDiscovery } = await release.load('cli/setup');
  const discovery = await setupDiscovery({ installationRoot: root, wakeMode: 'webhook', ...(input.projectId ? { projectId: input.projectId } : {}) });
  const env = { ...process.env, PHOTON_CONFIG_DIR: join(root, 'runtime/setup/photon-config'),
    DASHBOARD_CONFIG_DIR: join(root, 'runtime/setup/photon-config'), HOME: join(root, 'runtime/setup/home'),
    PHOTON_NO_UPDATE_NOTIFIER: '1', NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' };
  for (const key of ['NODE_OPTIONS','NODE_PATH','BUN_OPTIONS','PHOTON_TOKEN','DASHBOARD_TOKEN','PHOTON_ACCESS_TOKEN','PHOTON_PROJECT_ID']) delete env[key];
  // This helper uses the same existing trusted backend selected by discovery.
  return new Promise((resolve, reject) => {
    const child = spawn(discovery.photon.executable, args, { env, cwd: root, stdio: ['ignore','pipe','pipe'], shell: false });
    let stdout = '', count = 0, finished = false;
    const fail = code => { if (finished) return; finished = true; clearTimeout(timer); child.kill('SIGTERM'); reject(new Error(code)); };
    const timer = setTimeout(() => fail('PHOTON_ACCOUNT_OUTCOME_UNKNOWN'), 60000);
    child.stdout.on('data', bytes => { count += bytes.length; if (count > 1024*1024) return fail('PHOTON_ACCOUNT_OUTCOME_UNKNOWN'); stdout += bytes.toString('utf8'); });
    child.stderr.on('data', bytes => { count += bytes.length; if (count > 1024*1024) fail('PHOTON_ACCOUNT_OUTCOME_UNKNOWN'); });
    child.once('error', () => fail('PHOTON_ACCOUNT_COMMAND_FAILED'));
    child.once('close', code => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (code !== 0) { reject(new Error('PHOTON_ACCOUNT_COMMAND_FAILED')); return; }
      try {
        resolve(accountResult(JSON.parse(stdout)));
      } catch { reject(new Error('PHOTON_ACCOUNT_OUTCOME_UNKNOWN')); }
    });
  });
}
