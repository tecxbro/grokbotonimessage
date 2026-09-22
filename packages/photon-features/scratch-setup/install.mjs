import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installRelease } from '../scripts/install.mjs';
import { packageCandidate } from '../scripts/package.mjs';
import { check, ensureLauncher, parseArgs, only, packageRoot, errorCode, exists } from './common.mjs';
/** Build with existing full release gates, or install a checksum-verified assembled archive.
 * Never manufacture release metadata, overwrite old runtime state, or start a provider. */
export async function install(root, options = {}) {
  check(process.versions.node === '24.13.0', 'PINNED_NODE_REQUIRED');
  check(process.platform === 'linux', 'SETUP_VM_REQUIRED');
  let temporary;
  try {
    let archivePath = options.archivePath, checksum = options.checksum;
    if (!archivePath) {
      temporary = await mkdtemp(join(tmpdir(), 'photon-build-'));
      const output = join(temporary, 'release.gpf.gz');
      const build = await packageCandidate({ candidate: resolve(packageRoot, '../..'), output, provenanceMode: 'owner-local-tested' });
      archivePath = build.artifact; checksum = build.sha256;
    }
    check(typeof checksum === 'string' && /^[a-f0-9]{64}$/.test(checksum), 'ARTIFACT_CHECKSUM_REQUIRED');
    const result = await installRelease({ archivePath: resolve(archivePath), checksum, root });
    const launcher = await ensureLauncher(root);
    const configured = await exists(join(root, 'runtime', 'configuration.json'));
    return { ...result, launcher, configured, runtimeStartedByThisCommand: false, next: configured ? 'connect' : 'bind-webhook' };
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { command, root, options } = parseArgs(['install', ...process.argv.slice(2)]);
    only(options, ['--archive', '--sha256']);
    check(Boolean(options['--archive']) === Boolean(options['--sha256']), 'ARCHIVE_AND_CHECKSUM_REQUIRED');
    console.log(JSON.stringify(await install(root, { archivePath: options['--archive'], checksum: options['--sha256'] })));
  } catch (error) { console.error(errorCode(error)); process.exitCode = 1; }
}
