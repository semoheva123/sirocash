"""Vercel Python function. GitHub OIDC authenticates the isolated collector."""
from http.server import BaseHTTPRequestHandler
import hmac
import json
import os
import tempfile
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

AUDIENCE = 'sirocash-exchange-collector'
ISSUER = 'https://token.actions.githubusercontent.com'
WORKFLOW = 'semoheva123/sirocash/.github/workflows/exchange-collector.yml@refs/heads/main'
_jwks = None


def authorized(value):
    global _jwks
    if not value or not value.startswith('Bearer ') or len(value) > 8192:
        return False
    try:
        import jwt
        if _jwks is None:
            _jwks = jwt.PyJWKClient(ISSUER + '/.well-known/jwks', cache_jwk_set=True, lifespan=300, timeout=8)
        token = value[7:]
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=['RS256'], audience=AUDIENCE, issuer=ISSUER,
                            options={'require': ['exp', 'iat', 'nbf', 'sub', 'repository', 'ref', 'workflow_ref', 'event_name']}, leeway=10)
        expected = {'repository': 'semoheva123/sirocash', 'ref': 'refs/heads/main',
                    'workflow_ref': WORKFLOW, 'sub': 'repo:semoheva123/sirocash:ref:refs/heads/main'}
        return all(isinstance(claims.get(k), str) and hmac.compare_digest(claims[k], v) for k, v in expected.items()) and claims['event_name'] in ('schedule', 'workflow_dispatch')
    except Exception:
        return False


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log request headers, tokens, source body or database errors.

    def reply(self, status, value=None):
        data = json.dumps(value).encode() if value is not None else b''
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(204 if authorized(self.headers.get('Authorization')) else 401)

    def do_POST(self):
        if not authorized(self.headers.get('Authorization')):
            self.reply(401, {'state': 'UNAUTHORIZED'})
            return
        ca_path = None
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
            key = os.environ.get('SP_TODAY_API_KEY', '').strip()
            url = os.environ.get('DATABASE_URL', '')
            if not key or not url:
                self.reply(503, {'state': 'UNCONFIGURED'})
                return
            import certifi
            import psycopg
            from curl_cffi import requests
            from exchange_worker.collector import collect
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
            with psycopg.connect(url, autocommit=True, sslmode='verify-full', sslrootcert=root,
                                 connect_timeout=8, prepare_threshold=None, options='-c statement_timeout=10000') as db:
                with requests.Session(trust_env=False) as session:
                    result = collect(db, session, key, payload.get('bootstrap', False))
            self.reply(200, result)
        except Exception:
            self.reply(503, {'state': 'UNAVAILABLE'})
        finally:
            if ca_path:
                try:
                    os.unlink(ca_path)
                except OSError:
                    pass
