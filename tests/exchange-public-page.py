"""Offline public-page unit/transport/auth fixtures; no live I/O."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import unittest
import os,time,hmac,hashlib,importlib.util
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("public_http",Path(__file__).resolve().parents[1]/"api/exchange_collect.py")
http=importlib.util.module_from_spec(spec);spec.loader.exec_module(http)
from datetime import datetime,timezone
from exchange_worker.public_page import parse_public,public_request,LIMIT
NOW=datetime(2026,11,4,15,tzinfo=timezone.utc)
HTML='''<html><script>wrong شراء 999</script><a href="/currency/us-dollar"><h1>سعر الدولار الأمريكي</h1><p>سوريا - عام · ل.س جديدة</p><p>شراء</p><span>144.00</span><p>14,400 قديمة</p><p>مبيع</p><span>144.50</span><p>14,450 قديمة</p></a><a href="/currency/us-dollar">USD دولار أمريكي 144.00 144.50</a><h2>أسعار الصرف العالمية</h2><span>EUR/USD</span><div>1.1246</div><span>GBP/USD</span><div>1.3477</div><span>USD/TRY</span><div>50.0213</div><h2>أسعار الوقود</h2></html>'''
class Response:
 def __init__(self,status=200,headers=None,body=HTML.encode()):self.status_code=status;self.headers=headers or {'content-type':'text/html'};self.body=body;self.closed=False
 def iter_content(self,**kwargs):yield self.body
 def close(self):self.closed=True
class Session:
 def __init__(self,r):self.r=r;self.calls=0
 def get(self,url,**kw):
  self.calls+=1;assert url=='https://sp-today.com/';assert 'headers' not in kw;assert kw['verify'] is True;assert kw['allow_redirects'] is False
  if isinstance(self.r,Exception):raise self.r
  return self.r
class Tests(unittest.TestCase):
 def test_explicit_new_values_no_conversion_or_invented_timestamp(self):
  s=parse_public(HTML,NOW);self.assertEqual(s['market'],{'buy':144.0,'sell':144.5});self.assertEqual(s['unit'],'SYP_NEW');self.assertEqual(s['observation'],'public-page');self.assertEqual(s['fx'][0]['rate'],50.0213);self.assertNotIn('updatedAt',s['fx'][0]);self.assertEqual(s['fetchedAt'],NOW.isoformat())
 def test_ambiguity_and_unit_rejection(self):
  for bad in [HTML.replace('ل.س جديدة','ل.س'),HTML.replace('144.00','14400'),HTML.replace('14,400 قديمة','14,300 قديمة'),HTML.replace('144.50','143.50'),HTML.replace('USD/TRY','OTHER'),HTML+HTML]:
   with self.assertRaises(ValueError):parse_public(bad,NOW)
 def test_normal_optional_js_detection_is_not_a_price_challenge(self):
  s=Session(Response(body=(HTML+'<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>').encode()))
  self.assertEqual(public_request(s,NOW)[1],'OK')
  s=Session(Response(body=b'<title>Just a moment...</title>'))
  self.assertEqual(public_request(s,NOW)[1],'SCHEMA')
 def test_short_lived_purpose_bound_mac(self):
  secret='fixture-only-'*4;at=str(int(time.time()))
  def sign(at,purpose='public-exchange:POST:/api/exchange_collect:'):
   return 'PublicFeed '+at+'.'+hmac.new(secret.encode(),(purpose+at).encode(),hashlib.sha256).hexdigest()
  with patch.dict(os.environ,{'AUTH_SECRET':secret}):
   self.assertTrue(http.public_authorized(sign(at)))
   for value in [None,'Bearer '+at,sign(str(int(at)-100)),sign(str(int(at)+100)),sign(at,'other-purpose:'),sign(at)+'x']:
    self.assertFalse(http.public_authorized(value))
  with patch.dict(os.environ,{'AUTH_SECRET':''}):self.assertFalse(http.public_authorized(sign(at)))
 def test_one_request_and_fail_closed(self):
  for r,expected in [(Response(),'OK'),(Response(403),'AUTH_OR_CHALLENGE'),(Response(200,{'content-type':'text/html','cf-mitigated':'challenge'}),'AUTH_OR_CHALLENGE'),(Response(302),'HTTP'),(Response(body=b'x'*(LIMIT+1)),'BODY_LIMIT'),(Response(body=b'bad'),'SCHEMA'),(TimeoutError(),'NETWORK_OR_TIMEOUT')]:
   s=Session(r);snap,result,status=public_request(s,NOW);self.assertEqual(result,expected);self.assertEqual(s.calls,1)
   if expected!='OK':self.assertIsNone(snap)
   if not isinstance(r,Exception):self.assertTrue(r.closed)
if __name__=='__main__':unittest.main()
