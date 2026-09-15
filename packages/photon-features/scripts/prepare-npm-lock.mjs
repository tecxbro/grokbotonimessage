import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(root + 'package.json', 'utf8'));
const lock = JSON.parse(await readFile(root + '../../package-lock.json', 'utf8'));
const packages = { '': { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies, bin: pkg.bin, engines: pkg.engines } };
for (const [path, record] of Object.entries(lock.packages)) {
  if (path.startsWith('node_modules/') && !record.link) packages[path] = record;
  if (path.startsWith('packages/photon-features/node_modules/') && !record.dev) throw new Error('NESTED_RUNTIME_DEPENDENCY_REQUIRES_INTEGRATION');
}
for (const [path, record] of Object.entries(lock.packages)) {
  if (path.startsWith('packages/photon-features/node_modules/')) packages[path.slice('packages/photon-features/'.length)] = record;
}
const content = JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages }, null, 2) + '\n';
const destination = root + 'npm-shrinkwrap.json';
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== content) throw new Error('NPM_ARTIFACT_LOCK_DRIFT');
} else await writeFile(destination, content);
