/** Catalog-only deployment preflight; never returns names, UIDs or account balances. */
export async function verifyReceivingIdentitySchema(
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>,
) {
  const { rows } = await query(`SELECT c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ReceivingIdentity','ReceivingIdentityBudget') AND c.relkind='r'`);
  if (
    rows.length !== 2 ||
    rows.some(
      (r) => !r.relrowsecurity || r.anon_access || r.authenticated_access,
    )
  )
    throw Error("RECEIVING_IDENTITY_SCHEMA_UNSAFE");
  const {
    rows: [permissions],
  } = await query(`SELECT
 has_table_privilege('sirocash_app','"ReceivingIdentity"','SELECT') AS app_read,
 has_column_privilege('sirocash_app','"ReceivingIdentity"','displayName','UPDATE') AS app_name,
 has_column_privilege('sirocash_app','"ReceivingIdentity"','uid','UPDATE') AS app_uid,
 has_table_privilege('sirocash_app','"ReceivingIdentity"','INSERT,DELETE') AS app_reassign,
 has_table_privilege('sirocash_financial_worker','"ReceivingIdentity"','SELECT') AS worker_read,
 has_table_privilege('sirocash_financial_worker','"ReceivingIdentity"','INSERT,UPDATE,DELETE') AS worker_write,
 has_table_privilege('sirocash_app','"ReceivingIdentityBudget"','SELECT,INSERT,UPDATE,DELETE') AS budget_direct,
 has_function_privilege('sirocash_app','public.issue_receiving_identity(uuid)','EXECUTE') AS issue_direct,
 has_function_privilege('sirocash_app','public.receiving_identity_budget(uuid,text)','EXECUTE') AS budget_call,
 has_function_privilege('sirocash_financial_worker','public.receiving_identity_budget(uuid,text)','EXECUTE') AS worker_budget`);
  if (
    !permissions?.app_read ||
    !permissions.app_name ||
    permissions.app_uid ||
    permissions.app_reassign ||
    !permissions.worker_read ||
    permissions.worker_write ||
    permissions.budget_direct ||
    permissions.issue_direct ||
    !permissions.budget_call ||
    !permissions.worker_budget
  )
    throw Error("RECEIVING_IDENTITY_PERMISSIONS_UNSAFE");
  const {
    rows: [functions],
  } = await query(
    `SELECT count(*) AS total,count(*) FILTER(WHERE NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) AS private FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.wallet_uid_digit(text)'),to_regprocedure('public.issue_receiving_identity(uuid)'),to_regprocedure('public.provision_receiving_identity()'),to_regprocedure('public.guard_receiving_identity()'),to_regprocedure('public.receiving_identity_budget(uuid,text)'))`,
  );
  if (Number(functions?.total) !== 5 || Number(functions?.private) !== 5)
    throw Error("RECEIVING_IDENTITY_FUNCTION_ACCESS_UNSAFE");
  const {
    rows: [guards],
  } = await query(`SELECT
 (SELECT count(*) FROM pg_trigger WHERE tgname IN ('provision_receiving_identity','immutable_receiving_identity') AND tgrelid IN ('public."User"'::regclass,'public."ReceivingIdentity"'::regclass) AND NOT tgisinternal AND tgenabled IN ('O','A')) AS triggers,
 EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public."ReceivingIdentity"'::regclass AND c.contype='u' AND a.attname='uid' AND c.convalidated) AS uid_unique,
 (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.issue_receiving_identity(uuid)'),to_regprocedure('public.provision_receiving_identity()'),to_regprocedure('public.receiving_identity_budget(uuid,text)')) AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog']) AS definers`);
  if (
    Number(guards?.triggers) !== 2 ||
    guards?.uid_unique !== true ||
    Number(guards?.definers) !== 3
  )
    throw Error("RECEIVING_IDENTITY_GUARDS_MISSING");
  const {
    rows: [coverage],
  } = await query(
    'SELECT count(*) AS missing FROM "User" u LEFT JOIN "ReceivingIdentity" i ON i."userId"=u.id WHERE i."userId" IS NULL',
  );
  if (Number(coverage?.missing) !== 0)
    throw Error("RECEIVING_IDENTITY_BACKFILL_INCOMPLETE");
  return {
    status: "VERIFIED",
    publicAccess: false,
    immutableUid: true,
    backfillComplete: true,
  };
}
