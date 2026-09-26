# AI configuration walkthrough

Drives the running app as a customer Admin, in a new (non-demo) customer:

1. Agents are shown as blocked without configuration, and refining is refused with the reason.
2. The Admin configures the AI connection: model, a Verification override, document policy and a write-only key, then runs the billable-confirmed connection test.
3. The Admin adds a Knowledge Library document.
4. The Admin copies, edits, publishes and assigns a Start-up Pack.
5. A request is created with a synthetic PDF and refined. The story carries verified page citations, and the run record shows models per role, the context package, pack revisions and documents read.
6. A disabled pack, a forbidden tool and a revoked key are each refused safely.

`verify` (after a backend restart, in a new browser) checks everything persisted and that another customer cannot see it.

```
# backend (backend repo) with the loopback FAKE provider -- no Anthropic contact, no cost:
python3 scripts/fake_anthropic_provider.py --port 8765 &
JADE_AI_TEST_PROVIDER_URL=http://127.0.0.1:8765 ... uvicorn jde_api_service.main:app --app-dir api_service
JADE_E2E_PASSWORD=... python3 e2e/ai/ai_flow.py setup
# restart the backend
JADE_E2E_PASSWORD=... python3 e2e/ai/ai_flow.py verify
```

The model here is a scripted fake, and the app labels such runs "TEST PROVIDER". This proves the application, the
real Claude Code runtime and the controls — not Anthropic's API. That is the separate, approved
`scripts/prove_ai_real_provider.py`.
