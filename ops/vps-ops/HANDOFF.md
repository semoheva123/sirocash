# Handoff: bootstrap the private `semoheva123/vps-ops` repo

Copy everything in this directory except this file (including `.github/` and `.run`) to the root of the
private repo `semoheva123/vps-ops` and push to `main`. Context:

- Server: RackNerd VPS 23.94.186.5 (2 vCPU / 2 GB / 35 GB, Ubuntu 24.04). Runs OPX (operix.website) today; SiroCash later.
- A GitHub self-hosted runner (user `ops`, passwordless sudo) on the server executes `tasks/<name>.sh`.
- The Arena GitHub App has **no** `workflow_dispatch` permission; the trigger is a push to `main` that changes `.run`
  (line 1 = task, line 2 = args). Reports land in `reports/` (`reports/LATEST.md`), secret-like values masked.
- Rules: never print secret files (`/etc/*.env`); every server change is a committed task script;
  one scheduler per job (server timers only after the Vercel cron / Actions worker equivalent is disabled);
  pause (never delete) the OPX Vercel project; no SSH keys or passwords ever pass through the agent.
- First task: `diagnose` (read-only). Open questions for the user: TRUST_PROXY set? reverse proxy = Caddy/nginx? swap present?
