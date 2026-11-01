# UI UX Pro Max skill

Installed project-locally at `.agents/skills/ui-ux-pro-max/` using the upstream Universal / Agent Standard layout. Agents that support that layout can discover `SKILL.md`; other assistants can read it explicitly. Host-specific auto-discovery may require restarting the assistant. This is not a Figma connection or a change to the deployed application.

## Source

- Upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Installer: npm `ui-ux-pro-max-cli@2.15.0`
- npm integrity: `sha512-D0J/C40xrzzi5si6ZLtRGbEE5v3QjL7d4wJNnasmP3yfDSrGiuqVCdwQiqCNnIkbqOuVoA/uonR2o1WKXh3urw==`
- Install command: `npm exec --yes --ignore-scripts --package=ui-ux-pro-max-cli@2.15.0 -- uipro init --ai universal --offline`
- Only the requested `ui-ux-pro-max` skill was retained; unrelated companion skills produced by the installer were removed. Upstream MIT license is included alongside the skill.
- No application dependencies or lockfile changes. Python 3 standard library only; local searches require no network or credentials.

## Usage

Read `.agents/skills/ui-ux-pro-max/SKILL.md` before using its guidance. Example commands from the repository root:

```sh
python3 .agents/skills/ui-ux-pro-max/scripts/search.py 'fintech dashboard' --design-system --project-name SiroCash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py 'responsive layout' --stack nextjs
```

Both commands were smoke-tested successfully during installation. They print recommendations without applying changes. Generated review output is kept outside tracked source, under `.cache/`; do not persist a design system until the direction is approved.

Skill recommendations do not override user requirements or security rules. Preserve the approved blue/white interface, Arabic RTL/English LTR and push-only financial updates unless the user explicitly requests otherwise. Installation authorizes no redesign, financial activation, customer-data queries or changes to balances.
