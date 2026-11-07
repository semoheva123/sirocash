#!/usr/bin/env python3
"""Write a masked task report into reports/<utc-timestamp>-<task>.md."""
import os, re, sys, datetime, pathlib

src, outdir = sys.argv[1], pathlib.Path(sys.argv[2])
task = os.environ.get("TASK", "unknown")
status = os.environ.get("STATUS", "?")
run_url = os.environ.get("RUN_URL", "")
try:
    text = open(src, encoding="utf-8", errors="replace").read()
except FileNotFoundError:
    text = "(no output captured)"

# Defensive masking of anything that looks like a secret assignment or bearer token.
text = re.sub(r"(?i)\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|KEY|DSN|DATABASE_URL)[A-Z0-9_]*)\s*=\s*\S+",
              lambda m: f"{m.group(1)}=***", text)
text = re.sub(r"(?i)(bearer\s+)[a-z0-9._\-]+", r"\1***", text)
text = re.sub(r"postgres(ql)?://[^\s]+", "postgres://***", text)

limit = 200_000
if len(text) > limit:
    text = text[:limit] + f"\n...[truncated {len(text) - limit} chars]"

now = datetime.datetime.now(datetime.timezone.utc)
outdir.mkdir(parents=True, exist_ok=True)
path = outdir / f"{now.strftime('%Y%m%d-%H%M%S')}-{task}.md"
path.write_text(f"# {task} — {now.strftime('%Y-%m-%d %H:%M UTC')} — exit {status}\n\nRun: {run_url}\n\n```text\n{text}\n```\n", encoding="utf-8")
(outdir / "LATEST.md").write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
print("report written:", path)
