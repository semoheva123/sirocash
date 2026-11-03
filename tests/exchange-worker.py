"""Offline source/parser/OIDC fixtures. NEVER contacts a provider or database."""
import importlib.util
import json
import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from exchange_worker.collector import collection_slot, parse_overview, source_request, source_not_older, LIMIT
spec=importlib.util.spec_from_file_location('exchange_http',Path(__file__).resolve().parents[1]/'api/exchange_collect.py')
http=importlib.util.module_from_spec(spec);spec.loader.exec_module(http)
NOW=datetime(2026,11,3,7,tzinfo=timezone.utc)
def overview(now=NOW):
    at=now.isoformat()
    return dict(ok=True,data=dict(rates=[dict(code='USD',cities=dict(damascus=dict(buy=143.75,sell=144.25)),updated_at=at)],global_fx=[dict(pair='USD/TRY',rate=49.9),dict(pair='EUR/USD',rate=1.1)],updated_at=at))
class Response:
    def __init__(self,raw=None,status=200,headers=None,body=None):
        self.status_code=status;self.headers=headers or {'content-type':'application/json'}
        self.body=body if body is not None else json.dumps(raw or overview()).encode();self.read=False;self.closed=False
    def iter_content(self,**kwargs): self.read=True;yield self.body
    def close(self): self.closed=True
class Session:
    def __init__(self,response=None):self.response=response or Response();self.calls=[]
    def get(self,url,**kwargs):
        self.calls.append((url,kwargs))
        if isinstance(self.response,Exception):raise self.response
        return self.response
class Tests(unittest.TestCase):
    def test_slots(self):
        for utc in range(24):
            expected={7:10,8:10,11:14,12:14,15:18,16:18}.get(utc)
            actual=collection_slot(NOW.replace(hour=utc))
            self.assertEqual(actual,f'2026-11-03T{expected:02}:00' if expected else None)
        self.assertEqual(collection_slot(NOW,True),'2026-11-03T00:00:bootstrap')
    def test_parser_and_limits(self):
        raw=overview();s=parse_overview(raw,NOW)
        self.assertEqual(s['market']['buy'],143.75);self.assertEqual(s['unit'],'SYP_NEW');self.assertEqual(s['city'],'damascus');self.assertEqual(len(s['fx']),2)
        for val in [False,0,-1,'145',float('nan'),float('inf'),1e13]:
            raw=overview();raw['data']['rates'][0]['cities']['damascus']['buy']=val
            with self.assertRaises(ValueError):parse_overview(raw,NOW)
        for mutate in [lambda d:d['rates'].append(d['rates'][0]),lambda d:d.update(updated_at=(NOW+timedelta(hours=1)).isoformat()),lambda d:d['rates'][0].update(updated_at='2026-11-03'),lambda d:d['rates'][0]['cities'].update(damascus={'buy':150,'sell':145}),lambda d:d['global_fx'].append(d['global_fx'][0])]:
            raw=overview();mutate(raw['data'])
            with self.assertRaises(ValueError):parse_overview(raw,NOW)
    def test_one_verified_direct_call(self):
        session=Session();info,s,blocked=source_request(session,'TEST_SECRET',NOW)
        self.assertEqual(len(session.calls),1);url,args=session.calls[0]
        self.assertEqual(url,'https://api-v2.sp-today.com/api/v1/overview?lang=en')
        self.assertEqual(args['headers'],{'X-API-Key':'TEST_SECRET','Accept':'application/json'})
        self.assertTrue(args['verify']);self.assertFalse(args['allow_redirects']);self.assertEqual(args['impersonate'],'chrome')
        self.assertEqual(info['outcome'],'OK');self.assertIsNone(blocked);self.assertTrue(session.response.closed);self.assertNotIn('TEST_SECRET',json.dumps((info,s,blocked)))
    def test_stops_retains_and_quota(self):
        for response in [Response(status=403,headers={'content-type':'text/html','cf-mitigated':'challenge'}),Response(status=302),Response(status=429),Response(body=b'x'*(LIMIT+1)),Response(body=b'not-json'),RuntimeError('TEST_SECRET')]:
            session=Session(response);info,s,blocked=source_request(session,'TEST_SECRET',NOW)
            self.assertIsNone(s);self.assertEqual(len(session.calls),1);self.assertNotIn('TEST_SECRET',json.dumps(info))
            if isinstance(response,Response) and response.status_code in (302,403,429):self.assertFalse(response.read)
        info,s,b=source_request(Session(Response(headers={'content-type':'application/json','x-ratelimit-remaining':'0'})),'TEST_SECRET',NOW)
        self.assertEqual(info['outcome'],'OK');self.assertEqual(b,'quota');self.assertIsNotNone(s)
    def test_no_time_regression_or_fx_loss(self):
        old=parse_overview(overview(),NOW);new=parse_overview(overview(NOW-timedelta(hours=1)),NOW)
        self.assertFalse(source_not_older(new,old));self.assertTrue(source_not_older(old,new))
        new=dict(old,fx=[]);self.assertFalse(source_not_older(new,old))
    def test_oidc_is_scoped_and_signed(self):
        import jwt
        from cryptography.hazmat.primitives.asymmetric import rsa
        private=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        http._jwks=SimpleNamespace(get_signing_key_from_jwt=lambda t:SimpleNamespace(key=private.public_key()))
        at=datetime.now(timezone.utc)
        claims=dict(iss=http.ISSUER,aud=http.AUDIENCE,sub='repo:semoheva123/sirocash:ref:refs/heads/main',repository='semoheva123/sirocash',ref='refs/heads/main',workflow_ref=http.WORKFLOW,event_name='schedule',iat=at,nbf=at,exp=at+timedelta(minutes=5))
        def allowed(c):return http.authorized('Bearer '+jwt.encode(c,private,algorithm='RS256',headers={'kid':'fixture'}))
        self.assertTrue(allowed(claims));self.assertTrue(allowed(dict(claims,event_name='push')));self.assertFalse(http.authorized(None));self.assertFalse(http.authorized('Bearer junk'))
        for key,val in [('repository','attacker/repo'),('ref','refs/pull/20/merge'),('workflow_ref','other.yml'),('aud','other'),('iss','other'),('event_name','pull_request'),('sub','other'),('exp',at-timedelta(minutes=1))]:
            self.assertFalse(allowed(dict(claims,**{key:val})),key)
        other=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        self.assertFalse(http.authorized('Bearer '+jwt.encode(claims,other,algorithm='RS256')))
if __name__=='__main__':unittest.main()
