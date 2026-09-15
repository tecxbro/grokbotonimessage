import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const script = () => import(new URL('../../../../../../scripts/verify-ownership.mjs',import.meta.url).href);
const repositoryRoot=resolve(import.meta.dirname,'../../../../../..');
const git = (root:string,...args:string[]) => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const json = (root:string,path:string,value:unknown) => {
  const target=join(root,path);mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,`${JSON.stringify(value,null,2)}\n`);
};
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'photon-ci-history-'));
  git(root,'init','--initial-branch=main');
  git(root,'config','user.name','Photon CI Fixture');
  git(root,'config','user.email','photon-ci@example.invalid');
  writeFileSync(join(root,'baseline.txt'),'immutable foundation\n');
  git(root,'add','.');git(root,'commit','-m','foundation');
  const base=git(root,'rev-parse','HEAD');git(root,'tag','photon-v3-f0',base);
  git(root,'switch','-c','reviewed/wt-01');writeFileSync(join(root,'lane.ts'),'reviewed lane\n');
  git(root,'add','.');git(root,'commit','-m','reviewed lane');const reviewed=git(root,'rev-parse','HEAD');
  git(root,'switch','main');writeFileSync(join(root,'lane.ts'),'reviewed lane\n');writeFileSync(join(root,'integration.ts'),'assembly\n');
  json(root,'docs/worktrees/foundation.json',{tag:'photon-v3-f0',startCommit:base,comparisonCommit:base,contractVersion:'fixture',contractDigest:'fixture'});
  json(root,'docs/worktrees/worktree-map.json',{lanes:{integration:{base:'photon-v3-f0'}}});
  json(root,'docs/worktrees/integration/included-commits.json',{base:{tag:'photon-v3-f0',commit:base,contractVersion:'fixture',contractDigest:'fixture'},lanes:[{lane:'wt-01',reviewedCommits:[reviewed]}]});
  json(root,'docs/worktrees/ownership.json',{owners:{'wt-01':['lane.ts'],integration:['integration.ts','docs/worktrees/foundation.json','docs/worktrees/worktree-map.json','docs/worktrees/integration/included-commits.json','docs/worktrees/ownership.json']},snapshotRoots:{integration:[]},integrationMaintenance:[]});
  git(root,'add','.');git(root,'commit','-m','assembled candidate');
  return {root,base,reviewed};
}

test('fresh checkout requires full published history and works detached outside canonical paths',async t=>{
  const source=fixture();t.after(()=>rmSync(source.root,{recursive:true,force:true}));
  const clone=mkdtempSync(join(tmpdir(),'photon-ci-clone-'));t.after(()=>rmSync(clone,{recursive:true,force:true}));
  git(clone,'clone','--depth=1','--branch','main','--single-branch',`file://${source.root}`,'.');
  const {verifyIntegrationHistory,verifyOwnership}=await script();
  assert.throws(()=>verifyIntegrationHistory(clone),new RegExp(`MISSING_BASELINE_COMMIT:${source.base}`));
  git(clone,'fetch','--unshallow','--tags','origin','+refs/heads/*:refs/remotes/origin/*');
  git(clone,'checkout','--detach');
  const result=verifyOwnership(clone,'integration');
  assert.equal(result.baselineCommit,source.base);assert.equal(result.baselineTagPresent,true);
  assert.equal(result.requiredReviewedCommits,1);
});

test('recorded immutable SHA works without a tag, while wrong tags and missing objects fail closed',async t=>{
  const value=fixture();t.after(()=>rmSync(value.root,{recursive:true,force:true}));
  const {verifyIntegrationHistory}=await script();
  git(value.root,'tag','-d','photon-v3-f0');
  assert.equal(verifyIntegrationHistory(value.root).tagPresent,false);
  git(value.root,'tag','photon-v3-f0','HEAD');
  assert.throws(()=>verifyIntegrationHistory(value.root),/BASELINE_TAG_TARGET_MISMATCH/);
  git(value.root,'tag','-d','photon-v3-f0');
  const ledger=JSON.parse(execFileSync('git',['-C',value.root,'show','HEAD:docs/worktrees/integration/included-commits.json'],{encoding:'utf8'}));
  ledger.lanes[0].reviewedCommits=['1111111111111111111111111111111111111111'];json(value.root,'docs/worktrees/integration/included-commits.json',ledger);
  assert.throws(()=>verifyIntegrationHistory(value.root),/MISSING_REVIEWED_COMMIT:wt-01:1111111111111111111111111111111111111111/);
  ledger.base.commit='2222222222222222222222222222222222222222';json(value.root,'docs/worktrees/integration/included-commits.json',ledger);
  assert.throws(()=>verifyIntegrationHistory(value.root),/MISSING_BASELINE_COMMIT:2222222222222222222222222222222222222222/);
});

test('unauthorized assembled paths still fail ownership after history validation',async t=>{
  const value=fixture();t.after(()=>rmSync(value.root,{recursive:true,force:true}));
  const {verifyOwnership}=await script();
  writeFileSync(join(value.root,'unauthorized.ts'),'not owned\n');
  assert.throws(()=>verifyOwnership(value.root,'integration'),/UNOWNED_PATH:unauthorized.ts/);
});

test('integration workflow fetches complete history without widening permissions or toolchain pins',()=>{
  const workflow=readFileSync(join(repositoryRoot,'.github/workflows/photon-integration.yml'),'utf8');
  assert.match(workflow,/uses: actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/);
  assert.match(workflow,/permissions:\n\s+contents: read/);
  assert.match(workflow,/node-version: '24\.13\.0'/);
  assert.match(workflow,/npm install --global npm@10\.9\.2/);
  assert.match(workflow,/node scripts\/verify-ownership\.mjs integration --history-only/);
});
