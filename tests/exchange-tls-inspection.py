"""Offline-only response fixtures; never connects to the source."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("inspection", Path("scripts/inspect-exchange-tls.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response:
    def __init__(self, status=200, headers=None, body=b"<html>public fixture</html>"):
        self.status_code = status
        self.headers = headers if headers is not None else {"content-type": "text/html"}
        self.body = body
        self.closed = False
        self.read = False

    def iter_content(self, chunk_size):
        self.read = True
        yield self.body

    def close(self):
        self.closed = True


class Session:
    def __init__(self, response):
        self.response = response
        self.calls = 0

    def get(self, url, **options):
        self.calls += 1
        assert url == "https://sp-today.com/"
        assert options == {"impersonate": "chrome", "allow_redirects": False,
                           "verify": True, "timeout": (10, 20), "stream": True}
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class Tests(unittest.TestCase):
    def test_public_success(self):
        response = Response()
        session = Session(response)
        info, body = module.inspect(session)
        self.assertEqual(info["result"], "PUBLIC_HTML_RECEIVED")
        self.assertEqual(body, response.body)
        self.assertEqual(session.calls, 1)
        self.assertTrue(response.closed)

    def test_challenge_not_consumed_or_solved(self):
        response = Response(403, {"content-type": "text/html", "cf-mitigated": "challenge",
                                  "cf-ray": "1234567890abcdef-IAD"}, b"DO_NOT_LOG")
        info, body = module.inspect(Session(response))
        self.assertEqual(info["result"], "CHALLENGED")
        self.assertEqual(info["rayId"], "1234567890abcdef-IAD")
        self.assertIsNone(body)
        self.assertFalse(response.read)
        self.assertTrue(response.closed)
        self.assertNotIn("DO_NOT_LOG", str(info))

    def test_redirect_and_nonhtml_rejected(self):
        for response in [Response(302), Response(200, {"content-type": "application/json"})]:
            info, body = module.inspect(Session(response))
            self.assertEqual(info["result"], "HTTP_OR_FORMAT_REJECTED")
            self.assertIsNone(body)
            self.assertFalse(response.read)

    def test_size_limit(self):
        info, body = module.inspect(Session(Response(body=b"x" * (module.LIMIT + 1))))
        self.assertEqual(info["result"], "BODY_LIMIT")
        self.assertIsNone(body)

    def test_error_not_logged_no_retry(self):
        session = Session(RuntimeError("PRIVATE_DETAIL"))
        info, body = module.inspect(session)
        self.assertEqual(info["result"], "NETWORK_ERROR")
        self.assertEqual(session.calls, 1)
        self.assertNotIn("PRIVATE_DETAIL", str(info))
        self.assertIsNone(body)


if __name__ == "__main__":
    unittest.main()
