# Process journey — browser demonstration

`process_journey.py` drives the real frontend against the real local backend started by the backend's
`scripts/run_local_preview.sh`. It follows the BicycleWorks dealer-returns story (`S-BW-RETURNS`) through
process framework → story processes → process maps → design → implementation → as-built record.

What is not real, and is labelled as such on screen:
- The framework is a **SYNTHETIC fixture**: SYN- ids, not APQC content, no official identifiers.
- The process suggestions, the Architect design and the Technical Agent package come from **scripted stand-ins**
  (`scripts/seed_demo_process.py`), not model runs.
- Implementation and verification use the **simulated** DEV estate. No JDE is contacted.

Phase 1 checks these steps:
- the framework's provenance and hierarchy, and the links from a node to its stories;
- the suggestions and the confirmed, version-pinned mapping;
- the generated map diagram, with assumptions and confirmed practice drawn differently;
- the design's recorded process context;
- the journey links;
- all checkpoints, then finalising the as-built record and downloading its Markdown;
- importing framework v2, where references stay on v1, are marked changed, and the design is flagged;
- the assigned Domain Owner in a second browser, making a material map change and mapping a second story;
- refusal of a CNC operator.

Phase 2 runs after the preview is restarted, in fresh browsers. It checks that everything survived, and that a
new as-built draft cannot be finalised while the design is flagged.

```bash
# backend repo: start the preview; it prints the throwaway logins
scripts/run_local_preview.sh --reset
# frontend repo, another shell. Export the variables from .preview-data/credentials.env; never commit them.
set -a; source ../jde_change_factory_backend/.preview-data/credentials.env; set +a
export JADE_E2E_PASSWORD=$ADMIN_PW JADE_E2E_DO_PASSWORD=$DO_PW JADE_E2E_CNC_PASSWORD=$CNC_PW
export JADE_E2E_FIXTURES=../jde_change_factory_backend/fixtures/process_framework
PHASE=1 python3 e2e/process/process_journey.py
# stop the preview (Ctrl-C), start it again WITHOUT --reset, then:
PHASE=2 python3 e2e/process/process_journey.py
```
