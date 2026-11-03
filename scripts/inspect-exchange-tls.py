"""One public-page Chrome TLS-profile comparison. No keys/proxy/solver/retries.

Does not prove permission, source freshness, or suitability for a recurring feed.
Never disables certificate validation or continues through a Challenge Page.
"""
import json
from pathlib import Path
import re
from datetime import datetime, timezone

URL = "https://sp-today.com/"
LIMIT = 1024 * 1024


def inspect(session):
    info = {"client": "curl_cffi", "profile": "chrome", "status": None,
            "format": "none", "challenge": False, "rayId": None,
            "observedAt": datetime.now(timezone.utc).isoformat(), "result": "NETWORK_ERROR"}
    html = None
    response = None
    try:
        response = session.get(URL, impersonate="chrome", allow_redirects=False,
                               verify=True, timeout=(10, 20), stream=True)
        info["status"] = response.status_code
        content_type = response.headers.get("content-type", "")
        info["format"] = "html" if "text/html" in content_type else "other"
        info["challenge"] = response.headers.get("cf-mitigated") == "challenge"
        ray = response.headers.get("cf-ray", "")
        if re.fullmatch(r"[0-9a-f]{16,32}-[A-Z]{3}", ray):
            info["rayId"] = ray
        if info["challenge"]:
            info["result"] = "CHALLENGED"
        elif response.status_code != 200 or info["format"] != "html":
            info["result"] = "HTTP_OR_FORMAT_REJECTED"
        else:
            chunks = []
            size = 0
            for chunk in response.iter_content(chunk_size=16384):
                size += len(chunk)
                if size > LIMIT:
                    info["result"] = "BODY_LIMIT"
                    return info, None
                chunks.append(chunk)
            html = b"".join(chunks)
            info["bytes"] = size
            info["result"] = "PUBLIC_HTML_RECEIVED"
    except Exception:
        # No arbitrary library exception, headers, cookies or response body in logs.
        info["result"] = "NETWORK_ERROR"
    finally:
        if response is not None:
            response.close()
    return info, html


def main():
    from curl_cffi import requests
    out = Path(".cache/exchange-tls-inspection")
    out.mkdir(parents=True, exist_ok=True)
    # Ignore proxy environment variables; session/cookies are discarded after one call.
    with requests.Session(trust_env=False) as session:
        info, html = inspect(session)
    (out / "result.json").write_text(json.dumps(info), encoding="utf-8")
    print(json.dumps(info))
    if html is not None:
        (out / "home.html").write_bytes(html)
        print("::notice title=Public TLS source inspection::" + json.dumps(info))
        return 0
    print("::error title=Public TLS source inspection::" + json.dumps(info))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
