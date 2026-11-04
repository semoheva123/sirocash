"""One public-source read; writes only public static prices, never a wallet database."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from exchange_worker.public_page import public_request


def publish(session, output, now):
    snapshot, outcome, status = public_request(session, now)
    if snapshot is None:
        return False, outcome
    output.mkdir(parents=True, exist_ok=True)
    # public_request strictly validates explicitly labelled new SYP. No API key,
    # inferred conversion, credentials, customer data or fabricated timestamps.
    (output / 'rates.json').write_text(json.dumps(snapshot, ensure_ascii=False), encoding='utf-8')
    (output / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Public exchange observations</title><p>Public reference prices only.</p>', encoding='utf-8')
    return True, 'OK'


if __name__ == '__main__':
    from curl_cffi import requests
    with requests.Session() as session:
        success, outcome = publish(session, Path('static-exchange'), datetime.now(timezone.utc))
    print(json.dumps({'publishedCandidate': success, 'outcome': outcome}))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('publish=' + str(success).lower() + '\n')
    # Failure never uploads/replaces the existing Pages deployment. The workflow
    # disables its own schedule on failure, requiring explicit operator recovery.
