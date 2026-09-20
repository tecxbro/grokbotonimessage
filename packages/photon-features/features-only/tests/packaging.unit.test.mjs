import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeArchive,decodeArchive,sha256,packagePayloadDirectories,packageSupportFiles} from '../../scripts/package.mjs';
test('custom release allowlist includes the new feature profile',()=>{assert.ok(packagePayloadDirectories.some(row=>row.source==='features-only'&&row.archive==='features-only/'));});
test('custom release keeps every original payload directory and required manual',()=>{for(const name of ['dist/src','schemas','examples','src/state/migrations'])assert.ok(packagePayloadDirectories.some(row=>row.source===name));for(const name of ['package.json','SKILL.md','DEPLOYMENT.md','INSTALL.md','README.md'])assert.ok(packageSupportFiles.includes(name));});
test('actual archive codec preserves new skill and client bytes',async()=>{const files={};for(const name of ['SKILL.md','client.mjs','client-core.mjs','client.d.mts'])files[`features-only/${name}`]=await readFile(new URL(`../${name}`,import.meta.url));const archive=encodeArchive(files,{fixture:true});const decoded=decodeArchive(archive,sha256(archive));for(const row of decoded.files)assert.deepEqual(Buffer.from(row.content,'base64'),files[row.path]);assert.equal(decoded.files.length,4);});
test('including the profile does not weaken archive path or checksum validation',()=>{assert.throws(()=>encodeArchive({'../SKILL.md':'bad'},{}),/UNSAFE_ARCHIVE_PATH/);const bytes=encodeArchive({'features-only/SKILL.md':'safe'},{});assert.throws(()=>decodeArchive(bytes,'0'.repeat(64)),/CHECKSUM/);});
