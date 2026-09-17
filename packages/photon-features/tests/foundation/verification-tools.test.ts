import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync,mkdtempSync,readFileSync,writeFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'../../../../..');
const script=(name:string)=>import(new URL(`../../../../../scripts/${name}.mjs`,import.meta.url).href);
test('wrong worktree produces a real nonzero checker exit',()=>{
 const result=spawnSync(process.execPath,[resolve(root,'scripts/verify-worktree.mjs'),'wt-00'],{cwd:root+'/packages/photon-features',encoding:'utf8'});assert.notEqual(result.status,0);
});
test('missing and skipped tests cannot produce PASS',async()=>{
 const {requireTests,validateTestResult}=await script('verify-lane');assert.throws(()=>requireTests(root,['absent.test.js']),/MISSING_REQUIRED/);
 for(const result of [{status:1,stdout:'# tests 1\n# skipped 0'},{status:0,stdout:'# tests 0\n# skipped 0'},{status:0,stdout:'# tests 1\n# skipped 1'},{status:0,stdout:'# tests 1\n# skipped 0\nnot ok 1 - failed'}])assert.throws(()=>validateTestResult(result));
 assert.equal(validateTestResult({status:0,stdout:'# tests 2\n# skipped 0\n# todo 0'}),2);
});
test('source checker rejects HTML, empty documents, forged success and hash mismatch',async()=>{
 const {validateDocument,fetchDocument}=await script('fetch-photon-docs');const {checkSourceLock}=await script('verify-docs');
 const record={classification:'official',url:'https://photon.codes/docs/a.md',finalUrl:'https://photon.codes/docs/a.md',status:200,contentType:'text/plain',retrievedAt:new Date().toISOString()};
 for(const body of ['','<!doctype html><html>Login</html>','# 404 Not found\n'+'x'.repeat(100)])assert.throws(()=>validateDocument(record,body));
 assert.throws(()=>validateDocument({...record,finalUrl:'https://photon.codes/login'},'# Title\n'+'x'.repeat(100)),/IDENTITY/);
 const failure=await fetchDocument(record.url,{fetcher:async()=>{throw new Error('offline');}});assert.equal(failure.record.status,null);assert.equal(failure.record.sha256,null);assert.equal(failure.body,null);
 const failed={...record,sha256:'invented',snapshot:null,identity:null,failure:'offline'};assert.throws(()=>checkSourceLock({version:1,sources:[failed]},()=>''),/FABRICATED/);
 assert.throws(()=>checkSourceLock({version:1,sources:[{...record,sha256:'wrong',snapshot:'docs/photon/reference/a.md',identity:'Title',failure:null}]},()=>'# Title\n'+'x'.repeat(100)),/HASH/);
});
test('documentation checker fails missing files and inconsistent acceptance evidence',async()=>{
 const {verifyDocs,checkEvidence}=await script('verify-docs');mkdirSync(resolve(root,'.photon-local/tests'),{recursive:true});const temp=mkdtempSync(resolve(root,'.photon-local/tests/docs-'));assert.throws(()=>verifyDocs(temp),/ENOENT/);
 const cases=Array.from({length:8},(_,i)=>({id:i+1,status:'passed',evidence:['not-run']}));assert.throws(()=>checkEvidence(cases,[]),/INCONSISTENT/);
});

// Run the real generator over isolated, real contract bytes. Only these fixture
// repositories change branch or detach; the developer's checkout is untouched.
function contractFixture(t: { after: (fn: () => void) => void }, revision = 'HEAD') {
 const parent=resolve(root,'.photon-local/tests');mkdirSync(parent,{recursive:true});
 const directory=mkdtempSync(resolve(parent,'contract-target-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const archive=execFileSync('git',['archive',revision,'package.json','package-lock.json',
   'packages/photon-features/package.json','packages/photon-features/src',
   'packages/photon-features/schemas','docs/worktrees/foundation.json','docs/worktrees/ownership.json',
   ...(revision==='HEAD'?['docs/worktrees/integration/candidate-contract.json']:[])],{cwd:root,maxBuffer:16*1024*1024});
 execFileSync('tar',['-x','-C',directory],{input:archive});
 mkdirSync(resolve(directory,'scripts'));cpSync(resolve(root,'scripts/generate-contracts.mjs'),resolve(directory,'scripts/generate-contracts.mjs'));
 symlinkSync(resolve(root,'node_modules'),resolve(directory,'node_modules'),'dir');
 // Compile the archived revision's schemas, including genuine F0 schemas, rather
 // than borrowing assembled schemas when validating the immutable checkpoint.
 const compile=(relative:string)=>{
   for(const entry of readdirSync(resolve(directory,relative),{withFileTypes:true})) {
     const path=relative+'/'+entry.name;
     if(entry.isDirectory())compile(path);
     else if(entry.name.endsWith('.ts')&&!entry.name.endsWith('.d.ts')) {
       const output=resolve(directory,path.replace('/src/','/dist/src/').replace(/\.ts$/,'.js'));
       mkdirSync(dirname(output),{recursive:true});
       writeFileSync(output,ts.transpileModule(readFileSync(resolve(directory,path),'utf8'),{
         compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},fileName:path,
       }).outputText);
     }
   }
 };
 compile('packages/photon-features/src/contracts');
 const git=(...args:string[])=>execFileSync('git',['-C',directory,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','--initial-branch=codex/step-2-messaging-guidance');
 git('-c','user.name=Contract fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--allow-empty','-m','fixture');
 const check=(target?:string)=>spawnSync(process.execPath,[resolve(directory,'scripts/generate-contracts.mjs'),'--check',
   ...(target===undefined?[]:['--target',target])],{cwd:directory,encoding:'utf8'});
 return {directory,git,check};
}

test('explicit assembled target works on maintenance branches and detached PR checkouts',async t=>{
 const f=contractFixture(t);
 for(const branch of ['codex/step-2-messaging-guidance','maintenance/unlisted-contract-repair',null]) {
   if(branch===null)f.git('checkout','--detach');
   else if(branch!==f.git('branch','--show-current'))f.git('checkout','-b',branch);
   await t.test(branch??'detached PR',()=>{
     assert.equal(f.git('branch','--show-current'),branch??'');
     const result=f.check('assembled-candidate');assert.equal(result.status,0,result.stderr);
     const report=JSON.parse(result.stdout);
     assert.equal(report.target,'assembled-candidate');assert.equal(report.files, JSON.parse(readFileSync(resolve(f.directory,'docs/worktrees/integration/candidate-contract.json'),'utf8')).digestFileCount);
     assert.equal(report.contractDigest,JSON.parse(readFileSync(resolve(root,'docs/worktrees/integration/candidate-contract.json'),'utf8')).contractDigest);
     assert.notEqual(f.check('foundation').status,0,'assembled bytes cannot satisfy the frozen foundation target');
   });
 }
});

test('explicit target still rejects schema, source hash and file-count drift without fallback',t=>{
 const f=contractFixture(t);f.git('checkout','--detach');
 for(const [path,change,error] of [
   ['packages/photon-features/schemas/action.schema.json',()=> '{}\n',/SCHEMA_DRIFT:action/],
   ['packages/photon-features/src/host/index.ts',(body:string)=>body+'\n// contract drift\n',/CONTRACT_DIGEST_DRIFT/],
   ['docs/worktrees/integration/candidate-contract.json',(body:string)=>JSON.stringify({...JSON.parse(body),digestFileCount:JSON.parse(body).digestFileCount + 1}),/CONTRACT_DIGEST_DRIFT/],
 ] as const) {
   const file=resolve(f.directory,path),original=readFileSync(file,'utf8');
   try {writeFileSync(file,change(original));const result=f.check('assembled-candidate');assert.notEqual(result.status,0);assert.match(result.stderr,error);}
   finally {writeFileSync(file,original);}
 }
 for(const target of [undefined,'auto','unknown']) {
   const result=f.check(target);assert.notEqual(result.status,0);assert.match(result.stderr,/CONTRACT_TARGET_REQUIRED/);
 }
 assert.equal(f.check('assembled-candidate').status,0);
});

test('explicit foundation target validates real immutable F0 bytes even on a maintenance branch',t=>{
 // The recorded commit is published history; the optional local tag need not
 // exist in CI. Never substitute HEAD or regenerate the foundation manifest.
 const {base}=JSON.parse(readFileSync(resolve(root,'docs/worktrees/integration/included-commits.json'),'utf8'));
 assert.match(base.commit,/^[a-f0-9]{40}$/);
 const f=contractFixture(t,base.commit);
 const before=readFileSync(resolve(f.directory,'docs/worktrees/foundation.json'));
 const result=f.check('foundation');assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);assert.equal(report.target,'foundation');assert.equal(report.files,36);
 assert.equal(report.contractDigest,JSON.parse(before.toString()).contractDigest);
 assert.deepEqual(readFileSync(resolve(f.directory,'docs/worktrees/foundation.json')),before);
 assert.notEqual(f.check('assembled-candidate').status,0,'missing candidate manifest never falls back to matching F0');
});

test('CI checks assembled contracts while the F0 verifier explicitly checks foundation',()=>{
 const scripts=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts;
 assert.match(scripts['photon:check'],/--target assembled-candidate$/);
 assert.match(scripts['photon:check:foundation'],/--target foundation$/);
 for(const name of ['photon-foundation.yml','photon-integration.yml','ci.yml']) {
   const workflow=readFileSync(resolve(root,'.github/workflows',name),'utf8');
   assert.match(workflow,/run: npm run photon:check\s*$/m);
   assert.match(workflow,/fetch-depth: 0/,'real F0 regression requires the immutable checkpoint history');
 }
 assert.match(readFileSync(resolve(root,'scripts/verify-lane.mjs'),'utf8'),/'schema-drift',\['scripts\/generate-contracts.mjs','--check','--target','foundation'\]/);
});
