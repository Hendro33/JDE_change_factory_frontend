# Role workspaces — browser demonstration

`role_workspaces.py` shows the three-role operating model on the DEMO customer, with throwaway identities and SYNTHETIC data:

| Role | What the script checks |
|---|---|
| **Domain Owner** (`do@e2e.local`) | <ul><li>Works in Business Demand.</li><li>My Work opens the story decision in **User Story Review**, where the story is approved.</li><li>Afterwards the story is "with Application Management", and nothing more is needed from them.</li><li>No Solution, Delivery or Technical tabs.</li><li>No Application Management.</li><li>No Administration.</li></ul> |
| **Application Manager** (`am@e2e.local`) | <ul><li>My Work opens **Backlog Review** (Gate 1).</li><li>Approve for Delivery admits the story to the **Delivery Queue**.</li><li>Architecture Review (Gate 2) shows the route with its confidence, the MCP operations and the exact change.</li><li>Every original screen has its own address: Dashboard, Active Changes, Validation, Ready for Release / CNC, Process & Maps, Technical Work, As-Built and the change record.</li><li>The role is called Application Manager.</li><li>No Administration.</li></ul> |
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

UX refinement checks also verify the exact sidebar and top navigation, role boundaries, relocated knowledge, and all four Insights periods for the Domain Owner, Application Manager and Administrator. Legacy workbench URLs remain covered.


## Visual workspace checks

`visual_workspace.py` exercises a multi-story backlog (grid first, no default selection, keyboard sorting, filtering and opening/closing a story), a 390px layout, and captures Architecture, Delivery/Validation, As-Built, Connections, Agents, Insights and Dashboard.

Use the same `JADE_E2E_*` environment as the role walkthrough. In a fresh isolated backend data directory under `/private/tmp/jade-ux-walkthroughs-*`, run the backend's technical, process, functional and roles demo seed scripts, then run this directory's `seed_visual_backlog.py` **from the backend checkout** using its Python environment. The additional seed explicitly refuses the persistent preview and other data directories. Run the browser script from the frontend checkout with `JADE_E2E_SHOTS` set to an output directory. It approves the synthetic business stories and generates a draft as-built record only in that isolated data.

`ux_pilot.py` retains the original two-screen rating confirmation and role-handoff check. It uses a separate fresh fixture set; do not run it after the visual rollout has consumed the same Domain Owner queue.
