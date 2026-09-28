# Journey walkthrough

The three main journeys, driven in a browser against the real application, from an empty installation:

1. **Jade Administrator** (`admin_setup.py`): finish setup and own account, rename the customer, invite a Domain Owner,
   an Application Manager and a CNC operator, the customer's AI key and agent packs, Jira, the JD Edwards connection
   (address, certificate, approved reads, credential, evidence document, Test Connection, sample reads, Enable), the
   engagement scope and approval policy, a business domain, invitations accepted, the Domain Owner assigned.
2. **Domain Owner and Application Manager** (`story_journey.py`): a request is analysed into a story, placed in its
   domain, approved by the Domain Owner, approved for delivery; the Architect proposes the exact change; the
   Application Manager approves it (the current value is read live), a person applies it in DEV, Jade reads it back
   live, the approved test Orchestration runs live, and the as-built record is finalised.
3. **Restart** (`restart_check.py`): with the real backend restarted, the connections, credentials, scope and the
   delivered story are all still there.

```bash
e2e/journeys/run.sh
```

It uses a new temporary data folder and throwaway passwords each time, and never contacts a real JD Edwards system.

**What is stood in, and where.** The customer's AIS server is `ais_server.py`: a local HTTPS server with its own
certificate, serving the backend's test fixture, so Jade's real connection code runs unchanged. For journeys 1-2 the
language model is replaced at the Agent SDK boundary by scripted answers (`model_boundary_backend.py`), because a
test run should not need an Anthropic key or spend. Everything else is the production code path. `dev_apply.py` is
what a person does in JD Edwards DEV.

Set `JADE_E2E_CHROMIUM` to a Chromium executable if Playwright's own browser is not installed.
