import importlib.util
from pathlib import Path
import unittest
import json
spec = importlib.util.spec_from_file_location('api_tls', Path(__file__).resolve().parents[1] / 'scripts/inspect-exchange-api-tls.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Response:
    def __init__(self, status=200, headers=None, body=b'{"ok":true,"data":{"currency":{"code":"USD","secret":"TEST_KEY"}}}'):
        self.status_code = status
        self.headers = headers or {'content-type':'application/json'}
        self.body, self.read, self.closed = body, False, False
    def iter_content(self, chunk_size):
        self.read = True
        yield self.body
    def close(self):
        self.closed = True
class Session:
    def __init__(self, response):
        self.response, self.calls = response, []
    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

class Tests(unittest.TestCase):
    def test_single_direct_call(self):
        r=Response();s=Session(r);info=m.inspect(s,'TEST_KEY')
        self.assertEqual(len(s.calls),1)
        self.assertEqual(s.calls[0],(m.URL,dict(headers={'Accept':'application/json','X-API-Key':'TEST_KEY'},impersonate='chrome',allow_redirects=False,verify=True,timeout=(10,20),stream=True)))
        self.assertTrue(info['apiOk']);self.assertEqual(info['result'],'API_JSON_SUCCESS')
        self.assertTrue(r.closed);self.assertNotIn('TEST_KEY',json.dumps(info))
    def test_challenge_stops_unread(self):
        r=Response(403,{'content-type':'text/html','cf-mitigated':'challenge','cf-ray':'1234567890abcdef-IAD'})
        info=m.inspect(Session(r),'TEST_KEY')
        self.assertEqual(info['result'],'CHALLENGED');self.assertFalse(r.read);self.assertTrue(r.closed)
        self.assertEqual(info['rayId'],'1234567890abcdef-IAD')
    def test_rejections(self):
        for r in [Response(302),Response(403,{'content-type':'text/html'})]:
            self.assertEqual(m.inspect(Session(r),'TEST_KEY')['result'],'HTTP_OR_FORMAT_REJECTED');self.assertFalse(r.read)
        r=Response(401,body=b'{"ok":false,"error":{"code":"INVALID_API_KEY","message":"TEST_KEY"}}')
        info=m.inspect(Session(r),'TEST_KEY');self.assertEqual(info['providerCode'],'INVALID_API_KEY');self.assertNotIn('TEST_KEY',json.dumps(info))
    def test_json_limits_and_schema(self):
        for body, expected in [(b'x'*(m.LIMIT+1),'BODY_LIMIT'),(b'not-json','INVALID_JSON'),(b'{"ok":true,"data":null}','API_JSON_REJECTED'),(b'{"ok":true,"data":{}}','API_JSON_SUCCESS')]:
            self.assertEqual(m.inspect(Session(Response(body=body)),'TEST_KEY')['result'],expected)
    def test_quota_and_untrusted_code(self):
        r=Response(429,{'content-type':'application/json','cf-ray':'TEST_KEY'},b'{"error":{"code":"TEST_KEY"}}')
        info=m.inspect(Session(r),'TEST_KEY');self.assertTrue(info['quota']);self.assertIsNone(info['rayId']);self.assertNotIn('TEST_KEY',json.dumps(info))
    def test_no_retry_or_exception_echo(self):
        s=Session(RuntimeError('TEST_KEY private exception'));info=m.inspect(s,'TEST_KEY')
        self.assertEqual(len(s.calls),1);self.assertEqual(info['result'],'NETWORK_ERROR');self.assertNotIn('TEST_KEY',json.dumps(info))
if __name__ == '__main__': unittest.main()
