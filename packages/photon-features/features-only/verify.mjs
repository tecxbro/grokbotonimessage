import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export const profileRoot = here;
export async function loadCatalog() { return JSON.parse(await readFile(resolve(here,'catalog.json'),'utf8')); }

// A small source-shape checker for documentation drift, NOT an action validator.
function splitTopLevel(source) {
  let quote=null, escape=false, level=0, start=0; const result=[];
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quote) { if(escape) escape=false; else if(c==='\\') escape=true; else if(c===quote) quote=null; continue; }
    if(c==='"'||c==="'"||c==='`') {quote=c;continue;}
    if('([{'.includes(c))level++;
    if(')]}'.includes(c))level--;
    if(c===','&&level===0){result.push(source.slice(start,i).trim());start=i+1;}
  }
  if(quote||level!==0)throw new Error('UNSUPPORTED_SOURCE_SHAPE');
  result.push(source.slice(start).trim());return result.filter(Boolean);
}
export function sourceArguments(source) {
  const start=source.indexOf('export const operationArguments = {');
  const end=source.indexOf('} as const;',start);
  if(start<0||end<0)throw new Error('ACTION_SOURCE_NOT_FOUND');
  const body=source.slice(start+'export const operationArguments = {'.length,end);
  const result=new Map();
  for(const entry of splitTopLevel(body)) {
    const match=/^"([a-zA-Z.]+)":\s*obj\(([\s\S]*)\)$/.exec(entry);
    if(!match)throw new Error('UNSUPPORTED_OPERATION_DECLARATION');
    let fields=match[2].trim();
    if(['space','message','poll'].includes(fields))fields=`{ ...${fields} }`;
    if(!fields.startsWith('{')||!fields.endsWith('}'))throw new Error('UNSUPPORTED_ARGUMENT_DECLARATION');
    const required=[],optional=[];
    for(const field of splitTopLevel(fields.slice(1,-1))) {
      if(/^\.\.\.(space|message|poll)$/.test(field)){required.push(field.slice(3));continue;}
      const parsed=/^(\w+)(?:\s*:\s*([\s\S]+))?$/.exec(field);
      if(!parsed)throw new Error('UNSUPPORTED_ARGUMENT_FIELD');
      ((parsed[2]||'').trim().endsWith('.optional()')?optional:required).push(parsed[1]);
    }
    if(result.has(match[1]))throw new Error('DUPLICATE_SOURCE_OPERATION');
    result.set(match[1],{required,optional});
  }
  return result;
}
export async function verifyProfile({ full=false }={}) {
  const catalog=await loadCatalog();
  const source=await readFile(resolve(here,'../src/contracts/actions.ts'),'utf8');
  const entries=sourceArguments(source);
  const seen=new Set();
  for(const item of catalog.operations) {
    if(seen.has(item.operation))throw new Error(`DUPLICATE_CATALOG:${item.operation}`);seen.add(item.operation);
    const fields=entries.get(item.operation);
    if(!fields)throw new Error(`UNKNOWN_CATALOG_OPERATION:${item.operation}`);
    for(const key of ['required','optional'])if([...fields[key]].sort().join()!==[...item[key]].sort().join())throw new Error(`ARGUMENT_DRIFT:${item.operation}:${key}`);
    for(const key of ['guide','code','schema','example']){
      if(typeof item[key]!=='string'||item[key].includes('://'))throw new Error(`NONLOCAL_REFERENCE:${item.operation}`);
      const target=resolve(here,item[key]);
      const packageRoot=resolve(here,'..');
      if(!target.startsWith(packageRoot+'/'))throw new Error('REFERENCE_OUTSIDE_PACKAGE');
      if(full||key==='guide')if(!(await stat(target)).isFile())throw new Error(`MISSING_REFERENCE:${item[key]}`);
    }
    if(!item.purpose||!item.boundary||item.liveVerification!=='not-established-by-this-profile')throw new Error('INCOMPLETE_CATALOG_EVIDENCE');
  }
  if(seen.size!==entries.size)throw new Error('MISSING_CATALOG_OPERATIONS');
  const manual=await readFile(resolve(here,'CATALOG.md'),'utf8');
  const tableNames=[...manual.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]);
  if(tableNames.join()!==catalog.operations.map(row=>row.operation).join())throw new Error('CATALOG_TABLE_DRIFT');
  for(const row of catalog.operations){
    const fields=values=>values.length?values.map(value=>'`'+value+'`').join(', '):'None';
    const expected='| `'+row.operation+'` | '+fields(row.required)+' | '+fields(row.optional)+' | '+row.purpose+' | [code]('+row.code+') / [schema]('+row.schema+') / [example]('+row.example+') / [guide]('+row.guide+') |';
    if(!manual.split('\n').includes(expected)||!manual.includes('**`'+row.operation+'`:** '+row.boundary))throw new Error('CATALOG_PROSE_DRIFT:'+row.operation);
  }

  const docs=['SKILL.md',...(await readdir(resolve(here,'guides'))).filter(n=>n.endsWith('.md')).map(n=>`guides/${n}`)];
  for(const name of docs) {
    const text=await readFile(resolve(here,name),'utf8');
    if(/\b(?:orchestrator|delegat(?:e|ion)|workers?|Grok|Auto[- ]?review|personality)\b/i.test(text))throw new Error(`NONFEATURE_INSTRUCTION:${name}`);
    if((text.match(/```/g)||[]).length%2)throw new Error(`UNCLOSED_CODE_FENCE:${name}`);
    for(const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const link=match[1]; if(link.startsWith('https://'))continue;
      const target=resolve(dirname(resolve(here,name)),link.split('#')[0]);
      if(full||target.startsWith(here+'/'))if(!(await stat(target)).isFile())throw new Error(`BROKEN_LINK:${name}:${link}`);
    }
  }
  let validatedExamples=0;
  if(full) {
    const {parseActionRequest,operations}=await import('../dist/src/contracts/actions.js');
    if([...operations].sort().join()!==[...seen].sort().join())throw new Error('COMPILED_CATALOG_DRIFT');
    for(const row of catalog.operations) {
      const raw=JSON.parse(await readFile(resolve(here,row.example),'utf8'));
      const action=parseActionRequest(raw);
      if(action.operation!==row.operation)throw new Error('EXAMPLE_OPERATION_MISMATCH');
      JSON.parse(await readFile(resolve(here,row.schema),'utf8'));
      validatedExamples++;
    }
    const featureLibrary=await import('../dist/src/feature-library.js');
    for(const name of ['createTextFeatures','createMediaFeatures','createPollFeatures','createCardFeatures','createNativeFeatures','createTypingFeatures','registerFeatureModules','parseActionRequest'])
      if(typeof featureLibrary[name]!=='function')throw new Error(`MISSING_FEATURE_EXPORT:${name}`);
  }
  return {operations:seen.size,argumentKeys:'source-checked',usageDocuments:docs.length,validatedExamples,
    existingCodeAndExampleLinks:full?'checked':'not-checked-in-this-mode',canonicalParser:full?'checked':'not-run',liveProvider:'not-tested'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const args=process.argv.slice(2); if(args.some(a=>a!=='--full'))throw new Error('UNKNOWN_FLAG');
    console.log(JSON.stringify(await verifyProfile({full:args.includes('--full')})));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
