# vps-ops

Private operations repo for the VPS (23.94.186.5). A GitHub self-hosted runner on the server
executes `tasks/*.sh` via the **Ops task on VPS** workflow (`workflow_dispatch` only).
Trigger: a push that changes `.run` on `main` (the Arena app cannot call workflow_dispatch). Reports are committed to `reports/` (latest copy in `reports/LATEST.md`) with secret-like values masked.

Rules:
- Never print the contents of `/etc/*.env` or any secret file.
- Every change to the server goes through a committed task script (auditable in git history).
- One scheduler per job: timers on the server are enabled only after the Vercel/Actions equivalent is disabled.
