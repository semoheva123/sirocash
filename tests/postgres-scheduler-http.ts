import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
/** Fixture-only stand-ins: execute real scheduler SQL without installing HTTP or
 * making any network calls. Caller is the isolated localhost fixture harness. */
export async function schedulerHttpAcceptance(pool:Pool){
 await pool.query(`
 CREATE SCHEMA extensions; CREATE SCHEMA cron;
 CREATE TABLE cron.job(jobid bigint,jobname text);
 CREATE TABLE cron.job_run_details(jobid bigint,end_time timestamptz);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
 CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $body$ SELECT decode(md5(random()::text)||md5(random()::text),'hex') $body$;
 CREATE TYPE extensions.http_header AS (field text,value text);
 CREATE FUNCTION extensions.http_header(text,text) RETURNS extensions.http_header LANGUAGE sql AS 'SELECT ROW($1,$2)::extensions.http_header';
 CREATE TYPE extensions.http_request AS (method text,uri text,headers extensions.http_header[],content_type text,content text);
 CREATE TYPE extensions.http_response AS (status integer,content_type text,headers extensions.http_header[],content text);
 CREATE FUNCTION extensions.http_set_curlopt(text,text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
 CREATE TABLE public.scheduler_http_fixture(status integer);
 INSERT INTO public.scheduler_http_fixture VALUES (200);
 CREATE FUNCTION extensions.http(request extensions.http_request) RETURNS extensions.http_response LANGUAGE plpgsql AS $$
 DECLARE status integer; token text; accepted boolean;
 BEGIN
  IF request.method<>'POST' OR request.uri<>'https://sirocash.vercel.app/api/internal/deposit-monitor-scheduled' THEN RAISE EXCEPTION 'BAD_FIXTURE_TARGET'; END IF;
  SELECT f.status INTO status FROM public.scheduler_http_fixture f;
  IF status=0 THEN RAISE EXCEPTION 'PRIVATE_TRANSPORT_DETAIL'; END IF;
  token:=substring((request.headers[1]).value from 8);
  accepted:=public.consume_deposit_monitor_ticket(encode(sha256(convert_to(token,'UTF8')),'hex'));
  IF NOT accepted THEN RAISE EXCEPTION 'TICKET_NOT_VISIBLE_OR_INVALID'; END IF;
  RETURN ROW(CASE WHEN status=201 THEN 200 ELSE status END,'application/json',NULL,CASE WHEN status=201 THEN 'invalid-json' ELSE '{"state":"COMPLETED","healthy":true}' END)::extensions.http_response;
 END $$;
 `);
 const ops=(await readFile('ops/supabase-deposit-monitor.sql','utf8')).replace(/^CREATE EXTENSION[^;]+;\n/gm,'');
 await pool.query(ops);
 const tick=async(status:number)=>{
  await pool.query('UPDATE "DepositMonitorTicket" SET "createdAt"=clock_timestamp()-interval \'4 minutes\',"expiresAt"=clock_timestamp()-interval \'2 minutes\'');
  await pool.query('UPDATE public.scheduler_http_fixture SET status=$1',[status]);
  // Separate commits model the explicit cron transaction boundary.
  await pool.query('SELECT public.prepare_deposit_monitor()');
  await pool.query('SELECT public.dispatch_deposit_monitor()');
  return (await pool.query('SELECT "usedAt","dispatchToken","httpStatus","resultState",healthy,"failureCode" FROM "DepositMonitorTicket" ORDER BY "createdAt" DESC LIMIT 1')).rows[0];
 };
 await pool.query('UPDATE "DepositMonitorSchedule" SET enabled=true');
 const ok=await tick(200);assert(ok.usedAt);assert.equal(ok.dispatchToken,null);assert.equal(ok.httpStatus,200);assert.equal(ok.resultState,'COMPLETED');assert.equal(ok.healthy,true);assert.equal(ok.failureCode,null);
 const fail=await tick(503);assert.equal(fail.httpStatus,503);assert.equal(fail.failureCode,'HTTP_FAILURE');assert.equal(fail.dispatchToken,null);
 const invalid=await tick(201);assert.equal(invalid.httpStatus,200);assert.equal(invalid.resultState,null);assert.equal(invalid.failureCode,'INVALID_RESULT');
 const transport=await tick(0);assert.equal(transport.httpStatus,null);assert.equal(transport.failureCode,'TRANSPORT_FAILED');assert.equal(transport.dispatchToken,null);
 const before=Number((await pool.query('SELECT count(*) FROM "DepositMonitorTicket"')).rows[0].count);
 await pool.query('UPDATE "DepositMonitorSchedule" SET enabled=false');await pool.query('SELECT public.prepare_deposit_monitor();SELECT public.dispatch_deposit_monitor()');
 assert.equal(Number((await pool.query('SELECT count(*) FROM "DepositMonitorTicket"')).rows[0].count),before);
 await pool.query('DROP FUNCTION public.dispatch_deposit_monitor();DROP FUNCTION public.prepare_deposit_monitor();DROP SCHEMA extensions CASCADE;DROP SCHEMA cron CASCADE;DROP TABLE public.scheduler_http_fixture;');
 console.log('Scheduler HTTP SQL PASS: committed capability, fixed isolated target, consume/clear, HTTP failure, transport exception, private allowlisted results and disabled no-op. Mock HTTP only.');
}
