"""Vercel Python function. GitHub OIDC authenticates the isolated collector."""
from http.server import BaseHTTPRequestHandler
import hmac
import hashlib
import time
import re
import json
import os
import tempfile
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

AUDIENCE = 'sirocash-exchange-collector'
ISSUER = 'https://token.actions.githubusercontent.com'
WORKFLOW = 'semoheva123/sirocash/.github/workflows/exchange-collector.yml@refs/heads/main'
_jwks = None


def public_authorized(value):
    # Dedicated purpose-bound, short-lived server-to-server MAC. Never a browser
    # credential; never sent to SP Today. Existing OIDC checks remain unchanged.
    secret=os.environ.get('AUTH_SECRET','')
    if len(secret)<32 or not isinstance(value,str):return False
    match=re.fullmatch(r'PublicFeed (\d{10})\.([a-f0-9]{64})',value)
    if not match or abs(time.time()-int(match[1]))>90:return False
    expected=hmac.new(secret.encode(),('public-exchange:POST:/api/exchange_collect:'+match[1]).encode(),hashlib.sha256).hexdigest()
    return hmac.compare_digest(match[2],expected)

def authorization_result(value):
    global _jwks
    if not value or not value.startswith('Bearer ') or len(value) > 8192:
        return False, 'AUTH_HEADER'
    phase = 'AUTH_DEPENDENCIES'
    try:
        import jwt
        import certifi
        import ssl
        if _jwks is None:
            # Portable serverless Python must use an explicit verified public CA bundle.
            _jwks = jwt.PyJWKClient(ISSUER + '/.well-known/jwks', cache_jwk_set=True,
                lifespan=300, timeout=8, ssl_context=ssl.create_default_context(cafile=certifi.where()))
        token = value[7:]
        phase = 'AUTH_JWKS'
        key = _jwks.get_signing_key_from_jwt(token).key
        phase = 'AUTH_TOKEN'
        claims = jwt.decode(token, key, algorithms=['RS256'], audience=AUDIENCE, issuer=ISSUER,
                            options={'require': ['exp', 'iat', 'nbf', 'sub', 'repository', 'ref', 'workflow_ref', 'event_name', 'repository_id', 'repository_owner_id']}, leeway=10)
        expected = {'repository': 'semoheva123/sirocash', 'ref': 'refs/heads/main',
                    'workflow_ref': WORKFLOW, 'sub': 'repo:semoheva123@321572336/sirocash@1439918663:ref:refs/heads/main',
                    'repository_id': '1439918663', 'repository_owner_id': '321572336'}
        labels = {'repository':'AUTH_REPOSITORY','ref':'AUTH_REF','workflow_ref':'AUTH_WORKFLOW','sub':'AUTH_SUBJECT','repository_id':'AUTH_REPOSITORY','repository_owner_id':'AUTH_REPOSITORY'}
        for k, v in expected.items():
            if not isinstance(claims.get(k), str) or not hmac.compare_digest(claims[k], v):
                return False, labels[k]
        if claims['event_name'] not in ('schedule', 'workflow_dispatch', 'push'):
            return False, 'AUTH_EVENT'
        return True, 'OK'
    except Exception:
        # Static categories only: never exceptions, decoded claims, key IDs or tokens.
        return False, phase


def authorized(value):
    return authorization_result(value)[0]


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log request headers, tokens, source body or database errors.

    def reply(self, status, value=None):
        data = json.dumps(value).encode() if value is not None else b''
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Exchange-Collector', 'public-page-v1')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        ok, reason = authorization_result(self.headers.get('Authorization'))
        self.reply(204 if ok else 401, None if ok else {'auth': reason})

    def do_POST(self):
        if not (authorized(self.headers.get('Authorization')) or public_authorized(self.headers.get('Authorization'))):
            self.reply(401, {'state': 'UNAUTHORIZED'})
            return
        ca_path = None
        phase = 'INITIALIZATION'
        try:
            if os.environ.get('VERCEL_ENV') != 'production':
                self.reply(503, {'state': 'DISABLED'})
                return
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= 64:
                self.reply(400, {'state': 'INVALID_INPUT'})
                return
            payload = json.loads(self.rfile.read(length)) if length else {}
            if not isinstance(payload, dict) or set(payload) - {'bootstrap'} or type(payload.get('bootstrap', False)) is not bool:
                self.reply(400, {'state': 'INVALID_INPUT'})
                return
            url = os.environ.get('DATABASE_URL', '')
            if not url:
                self.reply(503, {'state': 'UNCONFIGURED'})
                return
            phase = 'DEPENDENCIES'
            import certifi
            import psycopg
            from curl_cffi import requests
            from exchange_worker.public_page import collect_public
            parsed = urlsplit(url)
            if parsed.scheme not in ('postgres', 'postgresql'):
                raise ValueError('DB_CONFIG')
            # URL SSL flags cannot override hostname verification or our trusted CA.
            query = [(k, v) for k, v in parse_qsl(parsed.query) if k not in ('sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'pgbouncer', 'connection_limit', 'pool_timeout', 'schema', 'socket_timeout', 'sslaccept')]
            url = urlunsplit(parsed._replace(query=urlencode(query)))
            ca = os.environ.get('DATABASE_SSL_CA')
            root = certifi.where()
            if ca:
                with tempfile.NamedTemporaryFile(mode='w', prefix='exchange-ca-', delete=False) as f:
                    f.write(ca.replace('\\n', '\n'))
                    ca_path = root = f.name
            phase = 'DATABASE_CONNECT'
            with psycopg.connect(url, autocommit=True, sslmode='verify-full', sslrootcert=root,
                                 connect_timeout=8, prepare_threshold=None, options='-c statement_timeout=10000') as db:
                with requests.Session(trust_env=False) as session:
                    phase = 'COLLECTION'
                    result = collect_public(db, session)
                    result['mode']='public-page-v1'
            self.reply(200, result)
        except Exception:
            self.reply(503, {'state': 'UNAVAILABLE', 'phase': phase})
        finally:
            if ca_path:
                try:
                    os.unlink(ca_path)
                except OSError:
                    pass
