"""One durable observation per Damascus opening/midpoint/closing slot. No retries."""
import json
import math
import re
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

URL = 'https://api-v2.sp-today.com/api/v1/overview?lang=en'
LIMIT = 256 * 1024
DAMASCUS = ZoneInfo('Asia/Damascus')


def collection_slot(now, bootstrap=False):
    local = now.astimezone(DAMASCUS)
    if bootstrap:
        return local.strftime('%Y-%m-%dT00:00:bootstrap')
    for hour in (10, 14, 18):
        if hour <= local.hour < hour + 2:
            return local.strftime('%Y-%m-%dT') + f'{hour:02}:00'
    return None


def stamp(value, now):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', value):
        raise ValueError('SCHEMA')
    at = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not datetime(2000, 1, 1, tzinfo=timezone.utc) <= at <= now + timedelta(minutes=5):
        raise ValueError('SCHEMA')
    return at.astimezone(timezone.utc).isoformat()


def price(value):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 < value <= 1e12:
        raise ValueError('SCHEMA')
    return value


def parse_overview(raw, now):
    if not isinstance(raw, dict) or raw.get('ok') is not True or not isinstance(raw.get('data'), dict):
        raise ValueError('SCHEMA')
    d = raw['data']
    rates, fx = d.get('rates'), d.get('global_fx')
    if not isinstance(rates, list) or not isinstance(fx, list) or len(rates) > 1000 or len(fx) > 1000:
        raise ValueError('SCHEMA')
    usd = [r for r in rates if isinstance(r, dict) and r.get('code') == 'USD']
    if len(usd) != 1 or not isinstance(usd[0].get('cities'), dict):
        raise ValueError('SCHEMA')
    market = usd[0]['cities'].get('damascus')
    if not isinstance(market, dict):
        raise ValueError('SCHEMA')
    buy, sell = price(market.get('buy')), price(market.get('sell'))
    if buy > sell:
        raise ValueError('SCHEMA')
    global_at = stamp(d.get('updated_at'), now)
    quotes = []
    for pair in ('USD/TRY', 'EUR/USD'):
        rows = [r for r in fx if isinstance(r, dict) and r.get('pair') == pair]
        if len(rows) > 1:
            raise ValueError('SCHEMA')
        if rows:
            quotes.append(dict(pair=pair, rate=price(rows[0].get('rate')), updatedAt=global_at))
    return dict(source='sp-today', city='damascus', unit='SYP_NEW',
                market=dict(buy=buy, sell=sell, updatedAt=stamp(usd[0].get('updated_at'), now)),
                fx=quotes, fetchedAt=now.isoformat())


def source_request(session, key, now):
    """Only sanitized metadata and a strictly validated snapshot leave this function."""
    info = dict(outcome='NETWORK_OR_TIMEOUT', status=None, challenge=False, format='none', rayId=None)
    response, snapshot, blocked = None, None, None
    try:
        response = session.get(URL, headers={'X-API-Key': key, 'Accept': 'application/json'},
                               impersonate='chrome', verify=True, allow_redirects=False,
                               timeout=(10, 20), stream=True)
        info['status'] = response.status_code
        ct = response.headers.get('content-type', '').lower()
        info['format'] = 'json' if 'application/json' in ct else 'html' if 'text/html' in ct else 'other'
        info['challenge'] = response.headers.get('cf-mitigated') == 'challenge'
        ray = response.headers.get('cf-ray', '')
        if re.fullmatch('[a-f0-9]{16,32}-[A-Z]{3}', ray):
            info['rayId'] = ray
        if response.status_code == 429 or response.headers.get('x-ratelimit-remaining') == '0':
            blocked = 'quota'
            reset = response.headers.get('x-ratelimit-reset', '')
            if re.fullmatch(r'\d{10}', reset):
                at = datetime.fromtimestamp(int(reset), timezone.utc)
                if now < at <= now + timedelta(days=32):
                    blocked = at.isoformat()
        if info['challenge'] or response.status_code in (401, 403):
            info['outcome'], blocked = 'AUTH_OR_CHALLENGE', 'infinity'
        elif response.status_code != 200:
            info['outcome'] = 'QUOTA' if response.status_code == 429 else 'HTTP'
        elif info['format'] != 'json':
            info['outcome'], blocked = 'INVALID_RESPONSE', 'infinity'
        else:
            chunks, size = [], 0
            for chunk in response.iter_content(chunk_size=16384):
                size += len(chunk)
                if size > LIMIT:
                    info['outcome'], blocked = 'BODY_LIMIT', 'infinity'
                    return info, None, blocked
                chunks.append(chunk)
            try:
                snapshot = parse_overview(json.loads(b''.join(chunks)), now)
                info['outcome'] = 'OK'
            except (ValueError, TypeError, KeyError, OverflowError):
                info['outcome'], blocked = 'SCHEMA', 'infinity'
    except Exception:
        # Transport failures consume the slot; no immediate retry or exception echo.
        info['outcome'] = 'NETWORK_OR_TIMEOUT'
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass
    return info, snapshot, blocked


def source_not_older(snapshot, previous):
    if not isinstance(previous, dict):
        return True
    def at(s): return datetime.fromisoformat(s.replace('Z', '+00:00'))
    try:
        if at(snapshot['market']['updatedAt']) < at(previous['market']['updatedAt']):
            return False
        for old in previous['fx']:
            new = next((r for r in snapshot['fx'] if r['pair'] == old['pair']), None)
            if new is None or at(new['updatedAt']) < at(old['updatedAt']):
                return False
        return True
    except (ValueError, KeyError, TypeError):
        return False  # Never replace an unreadable old snapshot without investigation.


def collect(db, session, key, bootstrap=False):
    # DB time, not caller clock/input, chooses the daily slot and monthly budget.
    now = db.execute('SELECT now()').fetchone()[0]
    slot = collection_slot(now, bootstrap)
    if slot is None:
        return dict(state='SKIPPED', reason='OUTSIDE_SLOT')
    request_id = str(uuid.uuid4())
    with db.transaction():
        row = db.execute('''UPDATE "ExchangeReference" SET
         month=date_trunc('month',now() AT TIME ZONE 'UTC')::date,
         attempts=CASE WHEN month=date_trunc('month',now() AT TIME ZONE 'UTC')::date THEN attempts+1 ELSE 1 END,
         "requestId"=%s,"lastCollectionSlot"=%s,"lastOutcome"='TLS_COLLECTING'
         WHERE id='sp-today' AND "collectorEnabled" AND "collectorBlockedUntil"<=now()
         AND (month<>date_trunc('month',now() AT TIME ZONE 'UTC')::date OR attempts<93)
         AND ((%s AND snapshot IS NULL AND "lastCollectionSlot" IS NULL)
           OR (NOT %s AND ("lastCollectionSlot" IS NULL OR "lastCollectionSlot"<%s)))
         RETURNING snapshot''', (request_id, slot, bootstrap, bootstrap, slot)).fetchone()
    if row is None:
        return dict(state='SKIPPED', reason='CLAIM_DENIED')
    previous = row[0]
    # Reservation is durably committed before network I/O. Unknown/crashed slots stay consumed.
    info, snapshot, blocked = source_request(session, key, now)
    if snapshot and not source_not_older(snapshot, previous):
        snapshot, info['outcome'] = None, 'SOURCE_TIME_REGRESSION'
    if blocked == 'quota':
        year, month = now.year + (now.month == 12), now.month % 12 + 1
        blocked = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
    with db.transaction():
        saved = db.execute('''UPDATE "ExchangeReference" SET
         snapshot=CASE WHEN %s::jsonb IS NULL THEN snapshot ELSE %s::jsonb END,
         "collectorBlockedUntil"=COALESCE(%s::timestamptz,"collectorBlockedUntil"),
         "lastOutcome"=%s,"lastHttpStatus"=%s,"lastIssues"=%s::jsonb
         WHERE id='sp-today' AND "requestId"=%s RETURNING id''',
         (json.dumps(snapshot) if snapshot else None, json.dumps(snapshot) if snapshot else None,
          blocked, info['outcome'], info['status'], json.dumps(dict(client='curl_cffi', profile='chrome', slot=slot, **info)), request_id)).fetchone()
    return dict(state='COLLECTED' if snapshot and saved else 'FAILED', reason=info['outcome'], httpStatus=info['status'])
