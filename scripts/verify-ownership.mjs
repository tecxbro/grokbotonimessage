import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Exact code ownership; snapshot exceptions can contain reference data only. */
export function checkOwnership(manifest, paths, lane) {
  const seen = new Set();
  for (const [owner, files] of Object.entries(manifest.owners)) {
    for (const file of files) {
      if (seen.has(file)) throw new Error(`DUPLICATE_OWNERSHIP:${file}`);
      if (file.includes('..') || file.startsWith('/') || /[*?]/.test(file)) throw new Error(`NON_EXACT_OWNERSHIP:${owner}:${file}`);
      seen.add(file);
    }
  }
  if (!manifest.owners[lane]) throw new Error('UNKNOWN_LANE');
  const allowed = new Set(manifest.owners[lane]);
  for (const path of paths) {
    const snapshot = (manifest.snapshotRoots[lane] ?? []).some(prefix => path.startsWith(prefix) && /\.(md|txt|json)$/.test(path));
    if (!allowed.has(path) && !snapshot) throw new Error(`UNOWNED_PATH:${path}`);
  }
  return {lane, checked:paths.length};
}
export function changedPaths(root, base) {
  const run = args => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).split('\0').filter(Boolean);
  return [...new Set([...run(['diff','--name-only','-z',base,'--']), ...run(['diff','--cached','--name-only','-z','--']), ...run(['ls-files','--others','--exclude-standard','-z'])])].sort();
}
export function verifyOwnership(root=process.cwd(),lane='wt-00') {
  const manifest = JSON.parse(readFileSync(resolve(root,'docs/worktrees/ownership.json')));
  const {startCommit} = JSON.parse(readFileSync(resolve(root,'docs/worktrees/foundation.json')));
  const paths = changedPaths(root,startCommit);
  for (const path of paths) { try { if(lstatSync(resolve(root,path)).isSymbolicLink()) throw new Error('OWNED_SYMLINK_FORBIDDEN'); } catch(e) {if(e.code!=='ENOENT')throw e;} }
  return checkOwnership(manifest,paths,lane);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyOwnership(process.cwd(),process.argv[2] ?? 'wt-00'))); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}
