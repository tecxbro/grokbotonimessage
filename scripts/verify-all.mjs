import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { verifyLane, requireTests, validateTestResult } from './verify-lane.mjs';
const root=process.cwd();
try {
 verifyLane(root,'wt-00');
 if(process.argv.includes('--mode=f0'))console.log('F0 passed; assembled product, installation and live verification excluded.');
 else {
   const tests=['packages/photon-features/dist/tests/security/context-scope.test.js','packages/photon-features/dist/tests/security/claim-fencing.test.js','packages/photon-features/dist/tests/security/media-access.test.js','packages/photon-features/dist/tests/security/webhook-auth.test.js','packages/photon-features/dist/tests/e2e/*.test.js'];
   requireTests(root,tests.filter(p=>!p.includes('*')));
   const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
   try {validateTestResult(result);}catch(e){console.error(result.stdout);throw e;}
   const packed=spawnSync('npm',['pack','--workspace=@grokbot/photon-features','--dry-run','--json','--ignore-scripts'],{cwd:root,encoding:'utf8',timeout:60000});
   if(packed.status!==0)throw new Error('PACKAGING_FAILED');
   const paths=JSON.parse(packed.stdout)[0].files.map(f=>f.path);
   if(!paths.includes('dist/src/host/main.js') || !paths.includes('schemas/action.schema.json') || !paths.includes('src/state/migrations/0001-initial.sql'))throw new Error('PACKAGE_INCOMPLETE');
   // Full verification is deliberately not a mechanism for triggering a live send.
   throw new Error('FULL_PRODUCT_NOT_VERIFIED: shared-service lane adaptation, 44-operation integration and separately authorized live evidence required');
 }
} catch(e){console.error(e.message);process.exitCode=1;}
