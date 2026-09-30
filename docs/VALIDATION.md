# Validation UI

The feature adds a dedicated Test Manager workspace at `/validation`. It preserves the Business Domain Owner's existing story workspace and adds only assigned acceptance-test tasks to My Work. Application Managers confirm deployments and decide release at `/am/validation`. Administrators configure validation under `/admin/validation`, with agents and knowledge continuing to use existing administration screens.

Backend and frontend must be deployed together from their `production-ready` branches. Start with administrator role assignment, environment profiles, AI pack assignment and storage/connection checks. There is no mock-data fallback. Unsupported or unconfigured execution remains blocked and visible.

The backend repository's `docs/VALIDATION.md` contains the complete setup guide, execution guarantees, test coverage and live-acceptance checklist. Its `scripts/prove_validation_ui.py --frontend PATH` performs the real-browser UI workflow against an isolated synthetic customer.

Build: `npm ci && npm run build`. Workflow regression checks: `node --test tests/workflow.test.mjs`.
