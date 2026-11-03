"""Real independent-session slot races, only against the disposable CI database."""
import concurrent.futures
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from datetime import timedelta
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import importlib.util
spec=importlib.util.spec_from_file_location('fixtures',Path(__file__).with_name('exchange-worker.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
import psycopg
from psycopg.conninfo import make_conninfo
from exchange_worker.collector import collect
BASE=os.environ.get('SIRO_TEST_POSTGRES_URL','')
parsed=urlsplit(BASE)
if os.environ.get('SIRO_ALLOW_ISOLATED_POSTGRES_TESTS')!='true' or parsed.hostname not in ('127.0.0.1','localhost') or parsed.password!='isolated-fixture-only':
    raise SystemExit('Disposable PostgreSQL fixture authorization required; no connection attempted.')
DSN=make_conninfo(BASE,dbname='sirocash_exchange_fixture')
class DB:
    def __init__(self,connection,now=f.NOW):self.c=connection;self.now=now
    def execute(self,sql,params=None):
        return self.c.execute(sql.replace('now()',"TIMESTAMPTZ '"+self.now.isoformat()+"'"),params)
    def transaction(self):return self.c.transaction()
class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with psycopg.connect(BASE,autocommit=True) as db:
            db.execute('CREATE DATABASE sirocash_exchange_fixture')
        with psycopg.connect(DSN,autocommit=True) as db:
            db.execute("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sirocash_app') THEN CREATE ROLE sirocash_app; END IF; END $$")
            for name in ('20261103200000_exchange_reference','20261103210000_exchange_diagnostics','20261104000000_exchange_tls_collector'):
                db.execute((Path(__file__).resolve().parents[1]/'prisma/migrations'/name/'migration.sql').read_text())
    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(BASE,autocommit=True) as db:db.execute('DROP DATABASE sirocash_exchange_fixture')
    def setUp(self):
        self.c=psycopg.connect(DSN,autocommit=True);self.db=DB(self.c)
        self.c.execute('TRUNCATE "ExchangeReference"')
        self.c.execute('''INSERT INTO "ExchangeReference"(id,month,attempts,"blockedUntil","collectorEnabled") VALUES('sp-today','2026-11-01',7,'infinity',true)''')
    def tearDown(self):self.c.close()
    def state(self):
        with self.c.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute('SELECT *,"blockedUntil"::text AS legacy_pause,"collectorBlockedUntil"::text AS collector_pause FROM "ExchangeReference"');return cur.fetchone()
    def test_independent_concurrent_claim_and_duplicate(self):
        barrier=threading.Barrier(2);lock=threading.Lock();calls=[]
        class S(f.Session):
            def get(self,*args,**kwargs):
                with lock:calls.append(1)
                return super().get(*args,**kwargs)
        def run():
            with psycopg.connect(DSN,autocommit=True) as c:
                barrier.wait();return collect(DB(c),S(),'TEST_SECRET')
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:run(),range(2)))
        self.assertEqual(len(calls),1);self.assertEqual(sorted(r['state'] for r in results),['COLLECTED','SKIPPED'])
        r=self.state();self.assertEqual(r['attempts'],8);self.assertEqual(r['legacy_pause'],'infinity');self.assertEqual(r['snapshot']['market']['buy'],143.75)
        s=S();self.assertEqual(collect(self.db,s,'TEST_SECRET')['state'],'SKIPPED');self.assertEqual(s.calls,[])
        self.assertNotIn('TEST_SECRET',json.dumps(r['lastIssues']))
        self.assertEqual(collect(self.db,S(),'TEST_SECRET',True)['state'],'SKIPPED')
    def test_challenge_halts_and_keeps_snapshot(self):
        old=f.parse_overview(f.overview(),f.NOW)
        self.c.execute('UPDATE "ExchangeReference" SET snapshot=%s::jsonb',(json.dumps(old),))
        s=f.Session(f.Response(status=403,headers={'content-type':'text/html','cf-mitigated':'challenge'}))
        self.assertEqual(collect(self.db,s,'TEST_SECRET')['reason'],'AUTH_OR_CHALLENGE');r=self.state()
        self.assertEqual(r['snapshot'],old);self.assertEqual(r['collector_pause'],'infinity');self.assertFalse(s.response.read)
        self.assertEqual(collect(DB(self.c,f.NOW+timedelta(hours=4)),f.Session(),'TEST_SECRET')['state'],'SKIPPED')
    def test_caps_month_reset_and_slot(self):
        self.c.execute('UPDATE "ExchangeReference" SET attempts=93')
        s=f.Session();self.assertEqual(collect(self.db,s,'TEST_SECRET')['state'],'SKIPPED');self.assertFalse(s.calls)
        december=f.NOW.replace(month=12,day=1)
        self.assertEqual(collect(DB(self.c,december),f.Session(f.Response(f.overview(december))),'TEST_SECRET')['state'],'COLLECTED');self.assertEqual(self.state()['attempts'],1)
    def test_bootstrap_once_and_no_rearm_after_failure(self):
        db=DB(self.c,f.NOW.replace(hour=21))
        s=f.Session(RuntimeError('TEST_SECRET'))
        self.assertEqual(collect(db,s,'TEST_SECRET',True)['state'],'FAILED')
        self.assertEqual(collect(db,s,'TEST_SECRET',True)['state'],'SKIPPED');self.assertEqual(len(s.calls),1)
        self.assertEqual(collect(db,s,'TEST_SECRET')['reason'],'OUTSIDE_SLOT')
    def test_quota_and_regression(self):
        s=f.Session(f.Response(headers={'content-type':'application/json','x-ratelimit-remaining':'0'}))
        self.assertEqual(collect(self.db,s,'TEST_SECRET')['state'],'COLLECTED');self.assertTrue(self.state()['collector_pause'].startswith('2026-12-01'))
        self.c.execute('UPDATE "ExchangeReference" SET "collectorBlockedUntil"=\'-infinity\'')
        old=self.state()['snapshot']
        s=f.Session(f.Response(f.overview(f.NOW-timedelta(hours=1))))
        self.assertEqual(collect(DB(self.c,f.NOW+timedelta(hours=4)),s,'TEST_SECRET')['reason'],'SOURCE_TIME_REGRESSION');self.assertEqual(self.state()['snapshot'],old)
if __name__=='__main__':unittest.main()
