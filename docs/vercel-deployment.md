# SiroCash deployment

## Isolated project

- Vercel scope: `s-9384`.
- New project: `sirocash` (`prj_OSx45P104oICfAoOelvrvlFdKrD6`).
- Repository: `https://github.com/semoheva123/sirocash`.
- Application branch: `arena/b6ad75ac-sirocash`.
- First deployment source commit: `44740803ad86ef16986aff3cb1846ed460185e10`.
- First deployment ID: `dpl_CEwZVMPZ5tYJD5u2DJSw3tVYQHyp`.
- Project dashboard: `https://vercel.com/s-9384/sirocash`.
- Build: `npm run build`; install: `npm ci`; Node.js: `22.x` (package engines).

Only the new project was created/deployed. Existing Vercel projects, domains, environment variables and deployments were not modified. No variables or secrets were copied from existing projects.

The first deployment was explicitly requested from the application branch above, not `main`. Repository linking alone does not prove automatic deployments are enabled. At creation, Vercel reported `productionBranch: main` and `gitProviderOptions.createDeployments: disabled`. Review automatic deployment settings in this project's dashboard before relying on Git pushes to deploy. Do not change other projects or force-push/replace `main` to resolve branch configuration.

## Remaining configuration

The dedicated Supabase schema and restricted backend role have been provisioned; see [Supabase setup](supabase-setup.md) for applied migrations and the pending pooler activation. No live database credentials or Resend configuration have been installed in Vercel. Production `WEBAUTHN_ORIGIN` is set to `https://sirocash.vercel.app` on SiroCash only. The UI can be deployed without them, but real account registration requires:

- `DATABASE_URL` for a separate appropriate PostgreSQL database, with migrations applied.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for a verified sending domain.
- Random `AUTH_SECRET` (32+ characters).
- Fixed trusted `WEBAUTHN_ORIGIN` matching the final HTTPS app origin.

Enter secrets only in Vercel environment settings or an approved secret-management flow; never put them in Git or chat. This project inherits deployment protection from the team, so preview/production URLs may require signing into Vercel unless that protection is deliberately configured for this project.

A successful deployment does **not** make the financial prototype production-ready. Demo wallets are shared, passkey approvals are still process-local, and blockchain/provider settlement is disabled. Persistent account-specific balances and security state are required before real financial use.
