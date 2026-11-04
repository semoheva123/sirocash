"""Independent static publisher: offline fixtures, no DB or external requests."""
import importlib.util
import json
import runpy
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
spec=importlib.util.spec_from_file_location('static_publisher','scripts/publish-static-exchange.py')
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
fixtures=runpy.run_path('tests/exchange-public-page.py',run_name='publisher_fixtures')
Session,Response,NOW=fixtures['Session'],fixtures['Response'],fixtures['NOW']
with tempfile.TemporaryDirectory() as directory:
 path=Path(directory)
 session=Session(Response())
 assert publisher.publish(session,path,NOW)==(True,'OK')
 assert session.calls==1
 snapshot=json.loads((path/'rates.json').read_text())
 assert snapshot['market']['buy']==144 and snapshot['unit']=='SYP_NEW'
 assert snapshot['observation']=='public-page' and 'updatedAt' not in snapshot['market']
 original=(path/'rates.json').read_bytes()
 for response in [Response(status=403),Response(body=b'not valid prices'),TimeoutError()]:
  failed=Session(response)
  success,outcome=publisher.publish(failed,path,NOW)
  assert not success and failed.calls==1
  assert (path/'rates.json').read_bytes()==original
 workflow=Path('.github/workflows/static-exchange.yml').read_text()
 for forbidden in ['DATABASE_URL','AUTH_SECRET','SP_TODAY_API_KEY','exchange_collect','secrets.']:
  assert forbidden not in workflow
 assert '/disable' in workflow and 'cancel-in-progress: false' in workflow
 assert "steps.collect.outputs.publish == 'true'" in workflow
print('Independent publisher PASS: one bounded credential-free public-source read, literal new SYP, valid-only static file, failed reads preserve existing output; workflow has no wallet secrets/DB/API bridge.')
