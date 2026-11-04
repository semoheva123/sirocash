"""Single central read of SP Today's PUBLIC page. No API key or price conversion."""
import json
import re
import uuid
from datetime import timezone
from html.parser import HTMLParser
from exchange_worker.collector import price
URL='https://sp-today.com/'
LIMIT=1024*1024
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.text=[];self.anchors=[];self.anchor=None;self.hidden=0
    def handle_starttag(self,t,a):
        if t in ('script','style','noscript','svg','template'):self.hidden+=1
        if not self.hidden and t=='a':self.anchor=[dict(a).get('href',''),[]]
    def handle_endtag(self,t):
        if t in ('script','style','noscript','svg','template'):self.hidden=max(0,self.hidden-1)
        if t=='a' and self.anchor:self.anchors.append((self.anchor[0],' '.join(self.anchor[1])));self.anchor=None
    def handle_data(self,d):
        if not self.hidden and d.strip():
            self.text.append(d.strip())
            if self.anchor:self.anchor[1].append(d.strip())
NUM=r'(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?'
def parse_public(html,now):
    p=Page();p.feed(html)
    cards=[t for href,t in p.anchors if href in ('/currency/us-dollar',URL+'currency/us-dollar') and 'ل.س جديدة' in t and 'سوريا - عام' in t]
    if len(cards)!=1:raise ValueError('SCHEMA')
    card=cards[0];values=[]
    for label in ('شراء','مبيع'):
        matches=re.findall(label+r'\s+('+NUM+r')\s+('+NUM+r')\s+قديمة',card)
        if len(matches)!=1:raise ValueError('SCHEMA')
        new,old=[float(n.replace(',','')) for n in matches[0]]
        # Check the page's explicit new/old pairing. NEVER divide an API price or
        # guess a unit from magnitude. Emit the literal NEW value shown on-page.
        if abs(old-new*100)>0.01:raise ValueError('UNIT_MISMATCH')
        values.append(price(new))
    if values[0]>values[1]:raise ValueError('SCHEMA')
    text=' '.join(p.text)
    sections=text.split('أسعار الصرف العالمية')
    if len(sections)!=2:raise ValueError('SCHEMA')
    section=sections[1].split('أسعار الوقود')[0]
    fx=[]
    for pair in ('USD/TRY','EUR/USD'):
        matches=re.findall(re.escape(pair)+r'\s+('+NUM+r')(?=\s|$)',section)
        if len(matches)!=1:raise ValueError('SCHEMA')
        fx.append(dict(pair=pair,rate=price(float(matches[0].replace(',','')))))
    # SSR exposes no trustworthy per-quote source timestamp. Preserve that absence;
    # fetchedAt is retrieval time, not a fabricated source-update time.
    return dict(source='sp-today',city='syria-general',unit='SYP_NEW',observation='public-page',
                market=dict(buy=values[0],sell=values[1]),fx=fx,fetchedAt=now.isoformat())
def public_request(session,now):
    response=None;status=None
    try:
        response=session.get(URL,impersonate='chrome',verify=True,allow_redirects=False,timeout=(10,20),stream=True)
        status=response.status_code
        if response.headers.get('cf-mitigated')=='challenge' or status in (401,403):return None,'AUTH_OR_CHALLENGE',status
        if status!=200:return None,'HTTP',status
        if 'text/html' not in response.headers.get('content-type','').lower():return None,'INVALID_RESPONSE',status
        chunks=[];size=0
        for chunk in response.iter_content(chunk_size=16384):
            size+=len(chunk)
            if size>LIMIT:return None,'BODY_LIMIT',status
            chunks.append(chunk)
        html=b''.join(chunks).decode('utf-8',errors='strict')
        if any(t in html.lower() for t in ('/cdn-cgi/challenge-platform/','cf-chl-','just a moment...')):return None,'AUTH_OR_CHALLENGE',status
        return parse_public(html,now),'OK',status
    except (ValueError,UnicodeError):return None,'SCHEMA',status
    except Exception:return None,'NETWORK_OR_TIMEOUT',status
    finally:
        if response is not None:response.close()
def collect_public(db,session):
    request_id=str(uuid.uuid4())
    # One durable claim globally, before I/O. No slot/window tied to scheduler arrival.
    # A crash consumes its five-minute slot. No retry, API, proxy or challenge solver.
    with db.transaction():
        row=db.execute('''UPDATE public."ExchangeReference" SET "publicRequestId"=%s,
          "publicNextAttemptAt"=now()+interval '5 minutes',"publicOutcome"='COLLECTING'
          WHERE id='sp-today' AND "publicEnabled" AND "publicBlockedUntil"<=now()
          AND "publicNextAttemptAt"<=now() RETURNING now()''',(request_id,)).fetchone()
    if row is None:
        # Read-only, credential-free diagnostics for this isolated feed, not user
        # or financial data. Distinguish an actual cooldown from a missing row.
        flags=db.execute("""SELECT count(*)::int,
          coalesce(bool_or("publicEnabled"),false),
          coalesce(bool_or("publicBlockedUntil"<=now()),false),
          coalesce(bool_or("publicNextAttemptAt"<=now()),false),
          coalesce(bool_or(snapshot->>'observation'='public-page'),false),
          current_user='sirocash_app'
          FROM public."ExchangeReference" WHERE id='sp-today'""").fetchone()
        return dict(state='SKIPPED',reason='CLAIM_DENIED',eligibility=dict(zip(('rows','enabled','unblocked','due','snapshotAvailable','appRole'),flags)))
    now=row[0].astimezone(timezone.utc)
    snapshot,outcome,status=public_request(session,now)
    # Pause challenge/schema failures for operator inspection. Transient failures
    # back off 30 minutes, keeping the last validated public-page snapshot intact.
    blocked='infinity' if outcome in ('AUTH_OR_CHALLENGE','SCHEMA','INVALID_RESPONSE','BODY_LIMIT') else None
    with db.transaction():
        db.execute('''UPDATE public."ExchangeReference" SET
          snapshot=CASE WHEN %s::jsonb IS NULL THEN snapshot ELSE %s::jsonb END,
          "publicOutcome"=%s,"publicHttpStatus"=%s,
          "publicBlockedUntil"=coalesce(%s::timestamptz,"publicBlockedUntil"),
          "publicNextAttemptAt"=CASE WHEN %s THEN "publicNextAttemptAt" ELSE now()+interval '30 minutes' END
          WHERE id='sp-today' AND "publicRequestId"=%s''',
          (json.dumps(snapshot) if snapshot else None,json.dumps(snapshot) if snapshot else None,outcome,status,blocked,bool(snapshot),request_id))
    return dict(state='COLLECTED' if snapshot else 'FAILED',reason=outcome,httpStatus=status)
