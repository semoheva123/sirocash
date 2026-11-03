"""Single direct authenticated API TLS comparison; no body/key/exception logs."""
import json
import os
import re
from datetime import datetime, timezone

URL = "https://api-v2.sp-today.com/api/v1/currency/usd?lang=en"
LIMIT = 1024 * 1024
CODES = set("MISSING_API_KEY INVALID_API_KEY INVALID_KEY API_KEY_DISABLED API_KEY_INACTIVE API_KEY_EXPIRED KEY_INACTIVE KEY_EXPIRED KEY_DISABLED DOMAIN_NOT_ALLOWED ORIGIN_NOT_ALLOWED IP_NOT_ALLOWED FORBIDDEN UNAUTHORIZED ACCESS_DENIED ENDPOINT_NOT_ALLOWED PLAN_REQUIRED SUBSCRIPTION_REQUIRED RATE_LIMIT_EXCEEDED MONTHLY_LIMIT_EXCEEDED QUOTA_EXCEEDED".split())


def inspect(session, key):
    info = dict(client="curl_cffi", profile="chrome", status=None, format="none",
                challenge=False, quota=False, rayId=None, apiOk=False,
                providerCode="UNRECOGNIZED_RESPONSE", result="NETWORK_ERROR",
                at=datetime.now(timezone.utc).isoformat())
    response = None
    try:
        response = session.get(URL, headers={"Accept": "application/json", "X-API-Key": key},
                               impersonate="chrome", allow_redirects=False,
                               verify=True, timeout=(10, 20), stream=True)
        info["status"] = response.status_code
        content_type = response.headers.get("content-type", "").lower()
        info["format"] = "json" if "application/json" in content_type else "html" if "text/html" in content_type else "other"
        info["challenge"] = response.headers.get("cf-mitigated") == "challenge"
        info["quota"] = response.status_code == 429 or response.headers.get("x-ratelimit-remaining") == "0"
        ray = response.headers.get("cf-ray", "")
        if re.fullmatch(r"[0-9a-f]{16,32}-[A-Z]{3}", ray):
            info["rayId"] = ray
        # Never consume or solve a challenge; no redirect, alternate profile or control request.
        if info["challenge"]:
            info["result"] = "CHALLENGED"
        elif info["format"] != "json" or 300 <= response.status_code < 400:
            info["result"] = "HTTP_OR_FORMAT_REJECTED"
        else:
            chunks, size = [], 0
            for chunk in response.iter_content(chunk_size=16384):
                size += len(chunk)
                if size > LIMIT:
                    info["result"] = "BODY_LIMIT"
                    return info
                chunks.append(chunk)
            try:
                raw = json.loads(b"".join(chunks))
            except (ValueError, UnicodeError):
                info["result"] = "INVALID_JSON"
                return info
            if isinstance(raw, dict):
                info["apiOk"] = response.status_code == 200 and raw.get("ok") is True and isinstance(raw.get("data"), dict)
                error = raw.get("error")
                code = error.get("code") if isinstance(error, dict) else None
                if isinstance(code, str) and code in CODES:
                    info["providerCode"] = code
            info["result"] = "API_JSON_SUCCESS" if info["apiOk"] else "API_JSON_REJECTED"
            if info["apiOk"]:
                info["providerCode"] = "OK"
    except Exception:
        info["result"] = "NETWORK_ERROR"
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass
    return info


def main():
    key = os.environ.pop("SP_TODAY_API_KEY", "").strip()
    if not key:
        print(json.dumps({"result": "KEY_UNAVAILABLE"}))
        return
    from curl_cffi import requests
    with requests.Session(trust_env=False) as session:
        info = inspect(session, key)
    # Only allowlisted diagnostics on stdout. No artifacts or raw upstream JSON.
    print(json.dumps(info))


if __name__ == "__main__":
    main()
