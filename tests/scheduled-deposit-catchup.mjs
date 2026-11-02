import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=await readFile('.github/workflows/financial-worker.yml','utf8');
const section=source.split('      - name: Invoke authenticated bounded worker')[1];
assert(section.includes("if: github.event_name == 'schedule'"));
const script=section.split('        run: |\n')[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');
assert(script.includes('seq 1 32'));assert(!script.includes('--location'));assert(!script.includes('set -x'));
const dir=await mkdtemp(join(tmpdir(),'siro-scheduled-scan-'));
try{
 await writeFile(join(dir,'curl'),`#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2),v=k=>a[a.indexOf(k)+1];
if(v('--request')!=='POST'||v('--header')!=='Authorization: Bearer '+process.env.WORKER_SECRET||v('--max-time')!=='175'||v('--retry')!=='0'||v('--proto')!=='=https'||a.at(-1)!=='https://sirocash.vercel.app/api/internal/financial-worker'||a.includes('--location'))process.exit(33);
const n=fs.existsSync('calls')?Number(fs.readFileSync('calls','utf8')):0;fs.writeFileSync('calls',String(n+1));
if(process.env.MOCK_STATUS==='transport')process.exit(7);
const bodies=JSON.parse(process.env.MOCK_BODIES);fs.writeFileSync(v('--output'),JSON.stringify(bodies[Math.min(n,bodies.length-1)]));process.stdout.write(process.env.MOCK_STATUS);
`);await chmod(join(dir,'curl'),0o700);
 const secret='synthetic-scheduler-not-real-'.repeat(2);
 const progress={state:'COMPLETED',healthy:false,scans:2,staged:0,held:0,valuations:0,checks:{TRC20:{state:'PROGRESSED',blocks:32,lagBlocks:441},BEP20:{state:'WAITING_FINALITY',blocks:0}}};
 const healthy={...progress,healthy:true};
 const full={state:'COMPLETED',processed:5,held:0};
 const badChecks=state=>({...progress,checks:{...progress.checks,TRC20:{state,blocks:32,failureCode:'PRIVATE_RESPONSE_MUST_NOT_LOG'}}});
 const cases=[
  ['200',[progress,healthy],true,2],['200',[progress],false,32],['200',[healthy],true,1],
  ['200',[full],true,1],['200',[{...full,held:1}],false,1],
  ...['FAILED','BUSY_OR_PAUSED','PRIVATE_RESPONSE_MUST_NOT_LOG'].map(s=>['200',[badChecks(s)],false,1]),
  ['200',[{...progress,held:1}],false,1],['200',[{...progress,held:false}],false,1],
  ['200',[{...progress,scans:0}],false,1],['200',[{...progress,scans:'2'}],false,1],
  ['200',[{...progress,checks:{...progress.checks,TRC20:{state:'PROGRESSED',blocks:0}}}],false,1],
  ['200',[{...progress,checks:{...progress.checks,TRC20:{state:'WAITING_FINALITY'}}}],false,1],
  ['200',[{...progress,healthy:undefined}],false,1],['200',[{state:'BUSY',processed:0,held:0}],false,1],
  ['200',[{}],false,1],['401',[healthy],false,1],['302',[healthy],false,1],['503',[healthy],false,1],['transport',[healthy],false,1],
 ];
 for(const [status,bodies,ok,calls] of cases){
  await rm(join(dir,'calls'),{force:true});
  const result=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8',timeout:15000,env:{PATH:dir+':'+process.env.PATH,WORKER_SECRET:secret,MOCK_STATUS:status,MOCK_BODIES:JSON.stringify(bodies)}});
  assert.equal(result.error,undefined);assert.equal(result.status===0,ok,JSON.stringify({status,bodies}));
  assert.equal(Number(await readFile(join(dir,'calls'),'utf8')),calls);
  assert(!(result.stdout+result.stderr).includes(secret));assert(!(result.stdout+result.stderr).includes('PRIVATE_RESPONSE_MUST_NOT_LOG'));
  await assert.rejects(readFile(join(dir,'worker-result.json')));
 }
 console.log('Scheduled catch-up PASS: <=32 deposit batches only after confirmed completed zero-held block progress; healthy exit, single-shot financial mode, no retry of HTTP/transport/held/unknown/busy failures, no secrets/raw responses. Mock transport only.');
}finally{await rm(dir,{recursive:true,force:true})}
