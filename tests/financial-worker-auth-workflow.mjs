import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=await readFile('.github/workflows/financial-worker.yml','utf8');
const manual=source.split('      - name: Verify worker credential without executing financial work')[1].split('      - name: Run isolated deposit monitor')[0];
assert(manual.includes("if: github.event_name == 'workflow_dispatch'"));
assert(source.split('      - name: Invoke authenticated bounded worker')[1].includes("if: github.event_name == 'schedule'"));
const script=manual.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
assert(!script.includes('--request POST'));assert(!script.includes('--location'));assert(!script.includes('set -x'));assert(script.includes('--output /dev/null'));
const route=await readFile('app/api/internal/financial-worker/route.ts','utf8');
const get=route.split('export async function GET')[1];assert(get.includes('status:204'));assert(!get.includes('financialDatabase('));assert(!get.includes('productionOutboxNetworkWorkers('));
const dir=await mkdtemp(join(tmpdir(),'siro-auth-workflow-'));
try{
 await writeFile(join(dir,'curl'),`#!/usr/bin/env node
const a=process.argv.slice(2);const value=k=>a[a.indexOf(k)+1];
if(value('--request')!=='GET'||value('--header')!=='Authorization: Bearer '+process.env.WORKER_SECRET||value('--output')!=='/dev/null'||value('--max-time')!=='20'||value('--retry')!=='0'||value('--proto')!=='=https'||a.at(-1)!=='https://sirocash.vercel.app/api/internal/financial-worker'||a.includes('--location'))process.exit(33);
if(process.env.MOCK_STATUS==='transport')process.exit(7);process.stdout.write(process.env.MOCK_STATUS);
`);await chmod(join(dir,'curl'),0o700);
 for(const [status,secret,expected] of [['204','synthetic-not-real-'.repeat(3),true],['401','synthetic-not-real-'.repeat(3),false],['302','synthetic-not-real-'.repeat(3),false],['503','synthetic-not-real-'.repeat(3),false],['transport','synthetic-not-real-'.repeat(3),false],['204','short',false],['204','x'.repeat(513),false]]){
  const r=spawnSync('bash',['-c',script],{encoding:'utf8',timeout:5000,env:{PATH:dir+':'+process.env.PATH,WORKER_SECRET:secret,MOCK_STATUS:status}});
  assert.equal(r.error,undefined);assert.equal(r.status===0,expected,status);assert(!(r.stdout+r.stderr).includes(secret));
  assert.equal(r.stdout.includes('AUTH_CHECK_PASS'),expected);
 }
 const monitor=source.split('      - name: Run isolated deposit monitor')[1].split('      - name: Invoke authenticated bounded worker')[0];
 assert(monitor.includes("if: github.event_name == 'workflow_dispatch'"));
 const monitorScript=monitor.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
 assert(!monitorScript.includes('--location'));assert(!monitorScript.includes('set -x'));
 await writeFile(join(dir,'curl'),`#!/usr/bin/env node
const a=process.argv.slice(2);const value=k=>a[a.indexOf(k)+1];
if(value('--request')!=='POST'||value('--header')!=='Authorization: Bearer '+process.env.WORKER_SECRET||value('--max-time')!=='175'||value('--retry')!=='0'||value('--proto')!=='=https'||a.at(-1)!=='https://sirocash.vercel.app/api/internal/deposit-monitor'||a.includes('--location'))process.exit(33);
if(process.env.MOCK_STATUS==='transport')process.exit(7);
require('fs').writeFileSync(value('--output'),process.env.MOCK_BODY);process.stdout.write(process.env.MOCK_STATUS);
`);
 const good={state:'COMPLETED',healthy:true,scans:2,staged:0,held:0,valuations:0};
 for(const [status,body,expected] of [['200',good,true],['401',good,false],['302',good,false],['503',good,false],['transport',good,false],['200',{...good,healthy:false},false],['200',{...good,held:1},false],['200',{...good,scans:'2'},false],['200',{},false]]){
  const secret='synthetic-not-real-'.repeat(3);
  const r=spawnSync('bash',['-c',monitorScript],{cwd:dir,encoding:'utf8',timeout:5000,env:{PATH:dir+':'+process.env.PATH,WORKER_SECRET:secret,MOCK_STATUS:status,MOCK_BODY:JSON.stringify(body)}});
  assert.equal(r.error,undefined);assert.equal(r.status===0,expected);assert(!(r.stdout+r.stderr).includes(secret));assert.equal(r.stdout.includes('DEPOSIT_MONITOR_PASS'),expected);
 }
 console.log('Isolated monitor workflow PASS: dedicated endpoint only, exact 200 plus healthy/no-held schema, reject errors/redirects/partial results, no raw bodies or credentials.');
 console.log('Worker authentication workflow PASS: auth step GET only, scheduled worker POST only, exact 204 required, rejected redirects/errors/missing secrets, bounded no-retry transport and no secret output. Mocked curl only; no network or financial effects.');
}finally{await rm(dir,{recursive:true,force:true})}
