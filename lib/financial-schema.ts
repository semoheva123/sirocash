/** Read-only catalog and zero-row permission probes; call inside a transaction. No account data. */
export const financialSchemaTables=['WalletOperation','EnergyRentalIntent','DepositAddressVault','UserDepositAddress','ChainDepositInbox','PlatformWithdrawalGuard','SignedSweepOutbox','SweepConfirmation','DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval','ApprovedDepositValuation','UsdtWithdrawalQuote','WithdrawalSigningGuard','SignedWithdrawalOutbox','PayoutDispatchApproval','PayoutDispatchAttempt','PayoutConfirmation','PayoutExpensePolicy','PayoutExpenseReservation'] as const;
type Query=(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>
export async function verifyFinancialSchema(query:Query){
 const {rows:[role]}=await query("SELECT current_user='sirocash_app' AS correct_role,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user");
 if(role?.correct_role!==true||role.rolsuper!==false||role.rolbypassrls!==false||role.rolcreaterole!==false)throw new Error('FINANCIAL_SCHEMA_UNSAFE_ROLE');
 const {rows}=await query(`SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_access,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_access,has_table_privilege('sirocash_app',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS runtime_access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[[...financialSchemaTables]]);
 if(rows.length!==financialSchemaTables.length)throw new Error('FINANCIAL_SCHEMA_TABLES_MISSING');
 for(const row of rows){
  const auth=['DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval'].includes(String(row.relname));
  if(row.relrowsecurity!==true||row.anon_access!==false||row.authenticated_access!==false||row.runtime_access!==auth)throw new Error('FINANCIAL_SCHEMA_ISOLATION_FAILED');
 }
 const {rows:[guards]}=await query(`SELECT (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND t.tgname IN ('immutable_signed_withdrawal','signed_withdrawal_settlement','immutable_payout_confirmation','immutable_usdt_withdrawal_quote')) AS triggers,(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND i.indisvalid AND i.indisunique AND c.relname IN ('payout_network_unresolved','payout_sender_nonce','sweep_source_unresolved','sweep_source_nonce','energy_sender_pending')) AS indexes`);
 if(Number(guards?.triggers)!==4||Number(guards?.indexes)!==5)throw new Error('FINANCIAL_SCHEMA_GUARDS_MISSING');
 // Catch denial only; an unexpected SQL/connection failure must not be reported as a pass.
 for(const table of ['WalletOperation','SignedWithdrawalOutbox','DepositAddressVault']){
  await query('SAVEPOINT financial_permission_probe');let denied=false;
  try{await query(`SELECT 1 FROM public."${table}" LIMIT 0`)}catch(error){if((error as {code?:string})?.code==='42501')denied=true;else throw new Error('FINANCIAL_SCHEMA_PERMISSION_PROBE_FAILED')}
  finally{await query('ROLLBACK TO SAVEPOINT financial_permission_probe');await query('RELEASE SAVEPOINT financial_permission_probe')}
  if(!denied)throw new Error('FINANCIAL_SCHEMA_RUNTIME_ACCESS_UNEXPECTED');
 }
 for(const table of ['DurablePasskeyCredential','DurablePasskeyChallenge','DurablePaymentApproval'])await query(`SELECT 1 FROM public."${table}" LIMIT 0`);
 return {status:'VERIFIED',tables:20,rls:true,publicAccess:false,runtimeFinancialAccess:false,authenticationStorage:true,guardsPresent:true,zeroRowQueries:true} as const;
}
