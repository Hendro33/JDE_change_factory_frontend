# Role workspaces — browser demonstration

`role_workspaces.py` shows the three-role operating model on the DEMO customer, with throwaway identities and SYNTHETIC data:

| Role | What the script checks |
|---|---|
| **Domain Owner** (`do@e2e.local`) | <ul><li>Works in Business Demand.</li><li>My Work opens the story decision in **User Story Review**, where the story is approved.</li><li>Afterwards the story is "with Application Management", and nothing more is needed from them.</li><li>No Solution, Delivery or Technical tabs.</li><li>No Application Management.</li><li>No Administration.</li></ul> |
| **Application Manager** (`am@e2e.local`) | <ul><li>My Work opens **Backlog Review** (Gate 1).</li><li>Approve for Delivery admits the story to the **Delivery Queue**.</li><li>Architecture Review (Gate 2) shows the route with its confidence, the MCP operations and the exact change.</li><li>Every original screen has its own address: Dashboard, Active Changes, Validation, Ready for Release / CNC, Process & Maps, Technical Work, As-built Records and the change record.</li><li>The role is called Application Manager.</li><li>No Administration.</li></ul> |
| **Administrator** (`admin@e2e.local`) | The only role that sees Administration. |

## Run

This uses the same backend seeds as the preview launcher (`scripts/run_local_preview.sh`), which creates all four accounts. Use a fresh data directory.

```bash
# backend repo, with the backend running on fresh data (see ../technical/README.md for the variables)
export JADE_E2E_DO_PASSWORD=... JADE_E2E_CNC_PASSWORD=... JADE_E2E_AM_PASSWORD=...
for s in technical process functional roles; do python3 scripts/seed_demo_$s.py bwm; done
# frontend repo
python3 e2e/workspaces/role_workspaces.py
```

Screenshots go to `e2e/workspaces/shots/` (gitignored).
