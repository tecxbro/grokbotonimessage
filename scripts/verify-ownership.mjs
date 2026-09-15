import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const fullCommitPattern = /^[0-9a-f]{40}$/;
const gitStatus = (root,args) => spawnSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const readJson = (root,path) => JSON.parse(readFileSync(resolve(root,path)));
function requireFullCommit(value, field) {
  if (typeof value !== 'string' || !fullCommitPattern.test(value)) throw new Error(`INVALID_COMMIT_ID:${field}`);
  return value;
}
function requireCommitObject(root, commit, error) {
  const result = gitStatus(root,['cat-file','-e',`${commit}^{commit}`]);
  if (result.status !== 0) throw new Error(error);
}
/** Resolve the immutable F0 identity and every reviewed lane object before diffing. */
export function verifyIntegrationHistory(root=process.cwd()) {
  const foundation = readJson(root,'docs/worktrees/foundation.json');
  const map = readJson(root,'docs/worktrees/worktree-map.json');
  const ledger = readJson(root,'docs/worktrees/integration/included-commits.json');
  const tag = ledger.base?.tag;
  if (typeof tag !== 'string' || gitStatus(root,['check-ref-format',`refs/tags/${tag}`]).status !== 0)
    throw new Error('INVALID_BASELINE_TAG_RECORD');
  if (foundation.tag !== tag || map.lanes?.integration?.base !== tag)
    throw new Error(`BASELINE_TAG_RECORD_MISMATCH:${tag}`);
  const base = requireFullCommit(ledger.base?.commit,'integration.base.commit');
  requireCommitObject(root,base,
    `MISSING_BASELINE_COMMIT:${base}:checkout with fetch-depth 0 and publish or fetch this recorded immutable commit`);
  const tagRef = `refs/tags/${tag}`;
  const tagObject = gitStatus(root,['show-ref','--verify','--quiet',tagRef]);
  let tagPresent = tagObject.status === 0;
  if (tagObject.status !== 0 && tagObject.status !== 1) throw new Error(`BASELINE_TAG_LOOKUP_FAILED:${tag}`);
  if (tagPresent) {
    const resolved = gitStatus(root,['rev-parse','--verify',`${tagRef}^{commit}`]);
    if (resolved.status !== 0) throw new Error(`BASELINE_TAG_NOT_COMMIT:${tag}`);
    const actual = resolved.stdout.trim();
    if (actual !== base) throw new Error(`BASELINE_TAG_TARGET_MISMATCH:${tag}:expected=${base}:actual=${actual}`);
  }
  const reviewed = [];
  const seen = new Set();
  for (const entry of ledger.lanes ?? []) {
    if (typeof entry.lane !== 'string' || !Array.isArray(entry.reviewedCommits) || entry.reviewedCommits.length === 0)
      throw new Error('INVALID_REVIEWED_COMMIT_LEDGER');
    for (const value of entry.reviewedCommits) {
      const commit = requireFullCommit(value,`${entry.lane}.reviewedCommits`);
      if (seen.has(commit)) throw new Error(`DUPLICATE_REVIEWED_COMMIT:${commit}`);
      seen.add(commit);
      requireCommitObject(root,commit,
        `MISSING_REVIEWED_COMMIT:${entry.lane}:${commit}:publish or fetch the exact reviewed lane commit before ownership verification`);
      const ancestor = gitStatus(root,['merge-base','--is-ancestor',base,commit]);
      if (ancestor.status !== 0) throw new Error(`REVIEWED_COMMIT_NOT_DESCENDANT:${entry.lane}:${commit}:base=${base}`);
      reviewed.push({lane:entry.lane,commit});
    }
  }
  if (reviewed.length === 0) throw new Error('EMPTY_REVIEWED_COMMIT_LEDGER');
  return {base,tag,tagPresent,reviewed};
}
function exactMaintenancePaths(root, manifest) {
  const paths = new Set();
  for (const [name,assignment] of Object.entries(manifest.maintenanceAssignments ?? {})) {
    const base = requireFullCommit(assignment.base,`maintenanceAssignments.${name}.base`);
    requireCommitObject(root,base,
      `MISSING_MAINTENANCE_BASE:${name}:${base}:publish or fetch the recorded maintenance base`);
    if (gitStatus(root,['merge-base','--is-ancestor',base,'HEAD']).status !== 0)
      throw new Error(`MAINTENANCE_BASE_NOT_ANCESTOR:${name}:${base}`);
    if (typeof assignment.manifest !== 'string' || assignment.manifest.includes('..') || assignment.manifest.startsWith('/') || /[*?]/.test(assignment.manifest))
      throw new Error(`INVALID_MAINTENANCE_MANIFEST_PATH:${name}`);
    const maintenance = readJson(root,assignment.manifest);
    if (maintenance.repairBase !== base || !Array.isArray(maintenance.files))
      throw new Error(`MAINTENANCE_MANIFEST_IDENTITY_MISMATCH:${name}`);
    for (const entry of maintenance.files) {
      const path = entry?.path;
      if (typeof path !== 'string' || path.includes('..') || path.startsWith('/') || /[*?]/.test(path))
        throw new Error(`NON_EXACT_MAINTENANCE_ASSIGNMENT:${name}:${String(path)}`);
      if (paths.has(path)) throw new Error(`DUPLICATE_MAINTENANCE_ASSIGNMENT:${path}`);
      paths.add(path);
    }
  }
  return paths;
}
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
  const manifest = readJson(root,'docs/worktrees/ownership.json');
  const {startCommit} = readJson(root,'docs/worktrees/foundation.json');
  const history = lane === 'integration' ? verifyIntegrationHistory(root) : undefined;
  const base = history?.base ?? startCommit;
  const paths = changedPaths(root,base);
  for (const path of paths) { try { if(lstatSync(resolve(root,path)).isSymbolicLink()) throw new Error('OWNED_SYMLINK_FORBIDDEN'); } catch(e) {if(e.code!=='ENOENT')throw e;} }
  if (lane === 'integration') {
    // An assembled candidate contains immutable reviewed lane deltas plus exact
    // integration-owned composition files. Derive the former from the ledger;
    // do not grant a wildcard over arbitrary working-tree paths.
    const reviewed = new Set();
    for (const {commit} of history.reviewed) {
      const output = execFileSync('git',['-C',root,'diff','--name-only','-z',base,commit,'--'],{encoding:'utf8'});
      for (const path of output.split('\0').filter(Boolean)) reviewed.add(path);
    }
    const owned = new Set(manifest.owners.integration);
    const assigned = new Set(Object.values(manifest.owners).flat());
    const maintenance = new Set(manifest.integrationMaintenance ?? []);
    const inheritedReadOnly = new Set(manifest.inheritedReadOnly ?? []);
    const repairAssignments = exactMaintenancePaths(root,manifest);
    for (const path of maintenance) {
      if (path.includes('..') || path.startsWith('/') || /[*?]/.test(path))
        throw new Error(`NON_EXACT_INTEGRATION_MAINTENANCE:${path}`);
      if (!assigned.has(path) && !manifest.inheritedReadOnly?.includes(path))
        throw new Error(`UNKNOWN_INTEGRATION_MAINTENANCE:${path}`);
    }
    const snapshots = manifest.snapshotRoots.integration ?? [];
    for (const path of paths) {
      const snapshot = snapshots.some(prefix => path.startsWith(prefix) && /\.(md|txt|json)$/.test(path));
      if (!reviewed.has(path) && !owned.has(path) && !maintenance.has(path) && !repairAssignments.has(path) && !inheritedReadOnly.has(path) && !snapshot) throw new Error(`UNOWNED_PATH:${path}`);
    }
    return {lane,baselineCommit:base,baselineTag:history.tag,baselineTagPresent:history.tagPresent,
      requiredReviewedCommits:history.reviewed.length,checked:paths.length,reviewedLanePaths:[...reviewed].filter(path=>paths.includes(path)).length,
      integrationPaths:paths.filter(path=>owned.has(path)||snapshots.some(prefix=>path.startsWith(prefix))).length,
      maintainedPaths:paths.filter(path=>maintenance.has(path)).length,
      repairAssignedPaths:paths.filter(path=>repairAssignments.has(path)).length};
  }
  return checkOwnership(manifest,paths,lane);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const lane = process.argv[2] ?? 'wt-00';
    const result = process.argv[3] === '--history-only' && lane === 'integration'
      ? verifyIntegrationHistory(process.cwd())
      : verifyOwnership(process.cwd(),lane);
    console.log(JSON.stringify(result));
  }
  catch(e) { console.error(e.message); process.exitCode=1; }
}
