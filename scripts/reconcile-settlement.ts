import {readFile} from 'node:fs/promises';
import {reconciliationSchema,reconcile} from '../lib/reconciliation';
async function main(){
 const file=process.argv[2];if(!file){console.error('Usage: npm run ops:reconcile -- <authorized-normalized-export.json>');process.exitCode=2;return}
 try{
  const input=reconciliationSchema.parse(JSON.parse(await readFile(file,'utf8'))),result=reconcile(input);
  // Print counts only: no customer IDs, external references, secrets or exported amounts in logs.
  console.log(JSON.stringify({matched:result.matched,ledgerRows:result.ledgerRows,providerRows:result.providerRows,discrepancies:result.errors.length}));
  if(!result.matched)process.exitCode=1;
 }catch{console.error('Invalid or unreadable reconciliation input.');process.exitCode=2}
}
main();
