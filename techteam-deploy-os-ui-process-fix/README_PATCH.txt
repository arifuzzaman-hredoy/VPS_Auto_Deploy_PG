TechTeam Deploy OS UI Process Fix

Fixed:
- Removed Tailwind-only class dependency from pages and moved UI to project CSS classes.
- Added shared AppShell sidebar/navigation/back button.
- Rebuilt Dashboard, Create Project, DNS Providers, Domain Manager, and Environment pages.
- Create Project now has clear 5-step process, progress checklist, review panel, .env parsing, correct GitHub Actions YAML, copy actions, and real /api/projects save flow.
- Fixed generated GitHub Actions YAML payload to match backend /api/deployments/trigger schema: repository, branch, commit, runId.
- Updated root npm scripts from -ws to --workspaces to remove npm warning.

Apply:
PowerShell: .\techteam-deploy-os-ui-process-fix\apply-replace.ps1
Bash: ./techteam-deploy-os-ui-process-fix/apply-replace.sh
