# Real-application walkthrough

Drives the running application (real backend, no sample data) the way a
customer administrator does, then checks that everything survives a backend
restart.

```
JADE_E2E_PASSWORD=...              # admin@e2e.local
JADE_E2E_DISCOVERY_PASSWORD=...    # a throwaway value; never a real JDE password
python3 e2e/realapp/walkthrough.py setup    # create a customer, configure everything
# restart the backend
python3 e2e/realapp/walkthrough.py verify   # everything is still there
```

`setup` creates the real customer "Walkthrough Foods BV", edits it, switches
the Architect Agent off for it, configures a live JDE connection
(`JADE_E2E_AIS`, default `https://141.144.202.25:7077`) and Jira, presses both
Test Connection buttons and records exactly what they report, then creates a
business domain and a request. Nothing is faked: a failed connection is
reported as failed.
