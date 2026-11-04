"""Read the already downloaded public response. No networking or secrets."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.text=[];self.anchors=[];self.anchor=None;self.hidden=0
    def handle_starttag(self,t,a):
        if t in ('script','style','noscript','svg'):self.hidden+=1
        if not self.hidden and t=='a':self.anchor=[dict(a).get('href',''),[]]
    def handle_endtag(self,t):
        if t in ('script','style','noscript','svg'):self.hidden=max(0,self.hidden-1)
        if t=='a' and self.anchor:
            self.anchors.append([self.anchor[0],' '.join(self.anchor[1])]);self.anchor=None
    def handle_data(self,d):
        if not self.hidden:
            if d.strip():self.text.append(d.strip())
            if self.anchor:self.anchor[1].append(d.strip())
s=Path('.cache/exchange-tls-inspection/home.html').read_text();p=Page();p.feed(s)
text=' '.join(p.text)
a=[a for a in p.anchors if a[0].endswith('/currency/us-dollar')]
i=text.find('أسعار الصرف العالمية')
info={'usd':a,'fx':text[i:i+230]}
print('::notice title=Public exchange fields::'+json.dumps(info,ensure_ascii=False))
for n in ['ل.س جديدة','USD/TRY','EUR/USD']:
 i=s.find(n);print('::notice title=Public exchange markup::'+json.dumps({'field':n,'html':s[max(0,i-180):i+350]},ensure_ascii=False))

import sys
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from exchange_worker.public_page import parse_public
at=json.loads(Path('.cache/exchange-tls-inspection/result.json').read_text())['observedAt']
parsed=parse_public(s,datetime.fromisoformat(at))
assert parsed['market']['buy']==144.0 and parsed['market']['sell']==144.5
print('::notice title=Validated real public snapshot::'+json.dumps(parsed,ensure_ascii=False))
