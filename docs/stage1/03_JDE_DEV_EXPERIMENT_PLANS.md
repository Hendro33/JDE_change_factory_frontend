# S1-4 JDE DEV experiments: prerequisites and bounded test plans

| | |
|---|---|
| Status | **Plans only. No JDE access has been used and no JDE write has been made.** Each experiment needs its own approved DEV scope, as below, before it starts. |
| Experiments | **A**: a real processing-option change. **E**: a representative technical-object change. They start **together**: E's answer changes the product more than A's, and waiting for A would delay it. |
| Design references | V11 §7.2–7.3 and §7.5–7.7. Update draft `docs/stage0/04_JADE_DESIGN_V13_DRAFT.md` §10–13. Backlog B-9, X-A, X-E. |
| Evidence labels | A result counts as **customer-DEV validated** only with the evidence listed below. Model-drafted code, fixtures or mock runs never count. If access is not granted, the result is recorded as **untested**, not as passed. |

---

## 0. Send these requests now (longest lead time)

One request pack to the customer's JDE owner and CNC covers both experiments.

| # | Request | For | Owner |
|---|---|---|---|
| Q-1 | Name the DEV environment, path code and AIS server URL to be used, plus the Tools release and ESU/Orchestrator level | A, E | Customer CNC |
| Q-2 | **Written isolation confirmation**: DEV's OCM mappings (business data, control tables, central objects) do not point at PY/PD data, and writes there cannot reach another environment | A, E | Customer CNC |
| Q-3 | A **DEV-only JDE service account** for AIS. Its role is limited to reading and revising processing options for the named application and versions. No other applications, no batch submission, no other environments. | A | Customer security / CNC |
| Q-4 | Two **customer-owned test versions** (not XJDE/ZJDE) of one interactive application, created by a person in OMW for this experiment, plus one non-financial, non-tax processing option on them with a small set of allowed values. The experiment uses `P4210` / Order Type as its working example unless the customer names a better one. | A | Customer functional lead |
| Q-5 | A **Windows development client** (the customer's standard FDA/RDA developer setup) on the DEV path code, with a DEV developer account and OMW project rights | E | Customer CNC |
| Q-6 | **One real, recent technical request** on a customer-owned object (system code 55–59), chosen from the representative sample (D-4), with its business test | E | Customer / owner |
| Q-7 | CNC time for **up to two DEV update-package builds**, and an agreed back-out procedure for the chosen object | E | Customer CNC |
| Q-8 | A named business tester for each experiment's behaviour check | A, E | Customer |

Credentials from Q-3 and Q-5 stay with the operator who runs the experiment. They go into that machine's environment only (`JDE_AIS_USERNAME` / `JDE_AIS_PASSWORD`), never into a repository, a chat or the shared host.

---

## Experiment A: real processing-option change

**Question:** can Jade read a real processing option, write an approved new value through a supported interface, and prove the result? Can it then do the same again on a second target without new engineering?

**Capability under test:** `processing_option_update` r1, currently **Needs spike** in `capability_catalog.json`. V11's "validated" wording was withdrawn in the Stage 0 audit: `FSR_SET_PROCESSING_OPTION` in `ais_client.py` is `None`, and no real write has ever been made.

### A. Prerequisites (all required before step A3)

| # | Prerequisite | How it is checked |
|---|---|---|
| A-P1 | Q-1 to Q-4 and Q-8 answered | The request pack is filed with the experiment record |
| A-P2 | Stage 1 **S1-1 and S1-2 merged**. The gate then enforces the company scope, approval policy and spike expiry. | Branch merged; `prove_the_gate.py` 17/17 on the operator's machine |
| A-P3 | The company's engagement scope is saved in Jade (ERP / JDE Landscape):<ul><li>DEV binding, with **isolation confirmed** and the Q-2 reference as evidence;</li><li>one approved-versions entry per target (`processing_option_update`, app, version, option, allowed values);</li><li>one **spike experiment** per target, with its window ending **no more than 5 working days** after the start;</li><li>an approval policy (e.g. Product Manager, 8 hours).</li></ul> | The screen shows each item; the server records who confirmed and who approved |
| A-P4 | The operator's machine has a network path to the DEV AIS server and runs the backend with `JDE_MCP_MOCK_MODE=false` and the four `JDE_AIS_*` variables | A read returns data (step A1) |
| A-P5 | **FSR template recorded.** `FSR_SET_PROCESSING_OPTION` needs a real Form Service Request for the processing-option form on this Tools release, built from the form's field IDs. The IDs are read with a read-only form request, and the template is reviewed and committed as a normal code change. | Code review of that one constant; no submission yet |
| A-P6 | Named people: the approver (under the policy), the functional consultant for the behaviour check, a CNC contact on call | Named in the experiment record |

### A. Bounded test plan

**Bounds.**

- DEV only.
- Two targets, one option each.
- At most **four writes**: two changes and two reverts.
- No batch runs, and no financial, tax, security or posting-related options.
- Everything happens within the spike window.

Each step either passes or stops the experiment; there is no "try another value".

| Step | Action | Pass | Stop if |
|---|---|---|---|
| A0 | Connect: get an AIS token for the DEV environment | The token is issued, and the response names the Q-1 environment | Any other environment is named, or auth needs broader rights |
| A1 | **Real read (B-9):** `get_processing_options` on target 1, with a human reading the same value in the JDE UI | Values match. The raw response and a screenshot are stored as evidence. | Mismatch, or the response is unexpectedly empty |
| A2 | Dry check of the FSR template against target 1: a read-only form request, with no save action | The field IDs resolve for this version | Field IDs differ from the recorded template |
| A3 | Propose the change (the Architect or the operator via `propose_change`), approve it in Jade under the policy, then run `set_processing_option` **live** for one value from the allowed set | AIS reports success, and Jade stores the before value | Any error, warning or unexpected form message |
| A4 | **New-session read-back:** new token, read the option again; a human also checks it in the JDE UI | It equals the new value in both | It differs anywhere |
| A5 | **Behaviour:** the business tester performs the ordinary business step on that version (e.g. starts a sales order and sees the default order type) | The expected behaviour is observed and recorded | No behaviour change, or a side effect outside the option |
| A6 | **Revert** as a separately proposed and approved change back to the A1 value, then read it back | Back to the original value | Revert fails. **Escalate to CNC; no further writes.** |
| A7 | **Second target:** repeat A1–A6 on target 2 with only a scope entry added, and no code change | Same passes | Target 2 needs new code. Record this as a reuse limitation; it is not a failure of A. |
| A8 | Live negative checks: a tampered value, and a spike past its window | Both refused by the gate **before** any AIS call (visible in the AIS log) | Any AIS call happens |

### A. Evidence to capture

- For every step:
  - the raw AIS request (credentials masked) and response;
  - Jade's change record (`change_id`, hash, company, approver authority, expiry);
  - the evidence-chain entry.
- UI screenshots for A1, A4 and A5, named by the tester.
- Timing and effort, split into:
  - vendor-native (AIS as shipped);
  - Jade platform code;
  - reusable capability code;
  - customer setup (versions, account, isolation);
  - bespoke per-request work.

### A. Outcomes and what follows

| Outcome | Meaning | Next |
|---|---|---|
| **Pass** (A0–A8) | `processing_option_update` is **customer-DEV validated** for this application, Tools release and ESU level | A person proposes the catalogue promotion as a reviewed change. X-B (selection/sequencing) reuses the pattern. |
| **Partial**: read works, write does not | Reads are validated; the write route is not | Record the precise AIS limitation. Evaluate the governed Orchestration route instead (design §10). |
| **Blocked** | Access not granted | Record as **untested**. Nothing is promoted. |

---

## Experiment E: representative technical-object change

**Question:** can the economically important technical work be automated, and if so, through which route and at what cost? The answer decides the Technical Agent's scope and whether a Windows runner is needed (D-8, Stage 5). A text-generation test cannot replace it.

**What is known today** (vendor-documented; see design §11):

- Event Rules in interactive and batch applications are edited in Windows design tools (FDA/RDA).
- No documented API edits ER.
- Web OMW exports and imports objects, but that is not an editing API.
- Changing spec content directly is unsupported.

Automation is therefore **not assumed**. The experiment measures which routes actually exist on this customer's release.

### E. Prerequisites

| # | Prerequisite | How it is checked |
|---|---|---|
| E-P1 | Q-1, Q-2, Q-5, Q-6, Q-7 and Q-8 answered | Request pack filed |
| E-P2 | **Object chosen** from the real workload (Q-6). It must be a customer-owned object (55–59), have a real recent request behind it, and be representative of frequent work. Default preference: a change to a custom interactive application's ER (the hardest common case). | The owner signs off the choice. The reason it is representative is written down. |
| E-P3 | A dedicated **OMW project** on the DEV path code, with the object checked out to it by the developer account | OMW shows the project and the checkout |
| E-P4 | **Back-out agreed with CNC before any change.** Until check-in: erase the checkout. After deployment: restore the previous object version and build a back-out package. | Written in the experiment record |
| E-P5 | Business test defined: the steps, the test data and the expected result | Tester agrees |
| E-P6 | A read-only **baseline**: an ER print or export of the object and current behaviour screenshots, stored off the client | Files in the experiment record |

Jade's execution gate is **not** involved in E. The Technical Agent's `authorized_object_types` stays empty, and Jade has no technical write tool. E is a human-run experiment, with the agent assisting under the same DEV approval.

### E. Bounded test plan

**Bounds.**

- One object, one OMW project, DEV path code only.
- At most **two** update-package builds.
- A time box of 10 working days elapsed.
- No promotion beyond DEV, and no Oracle-owned objects.

| Step | Action | Measures | Stop if |
|---|---|---|---|
| E0 | Baseline (E-P6); agree the test | — | The object is not customer-owned |
| E1 | **Agent analysis:** from the ER print, the request and the test, the agent produces an exact change proposal (event, line, logic) and a test. A technical reviewer scores it. | Correctness of the proposal, reviewer minutes, tokens and cost | The proposal is wrong in a way the reviewer could not fix in under 30 minutes. Record it and continue to E2 with a human-written change, to measure the rest. |
| E2 | **Route R1, human applies:** a developer applies the reviewed proposal in FDA/RDA and saves locally | Developer minutes, errors found | — |
| E3 | **Route R2, automated (optional, separately approved):** only if a supported or scriptable route exists on this client (e.g. an import route the vendor supports for this object type), tried on the same checkout **before** check-in. GUI automation is recorded as fragile, not as a product route. | Whether a route exists, its reliability over 3 attempts, operator minutes | Any need to edit spec files directly (unsupported). **Stop R2**, keep R1. |
| E4 | Check in; CNC builds and deploys the update package to DEV; the business test runs | CNC minutes, build issues, test result | The build fails twice. Back out (E-P4). |
| E5 | **Back-out drill:** CNC restores the previous version; the test confirms the old behaviour | Back-out minutes | Back-out fails. Escalate; no further changes. |

### E. Evidence to capture

- The baseline and the after-state: an ER print for each and a diff.
- The agent's proposal and the reviewer's score.
- For each route (R1, and R2 if tried): minutes per step for developer, reviewer, CNC and tester, plus agent tokens and cost.
- Package and test results.
- Back-out result.
- Effort split as for A.

### E. Outcomes and what follows

| Outcome | Meaning | Next |
|---|---|---|
| **Automatable via R2** | A supported route exists for this object type and release | Stage 5 designs the runner around it. Repeat on a second object type. |
| **Agent-assisted (R1)** | The agent's analysis and exact proposal save measurable time; a person applies the change | The Technical Agent is scoped as proposal-plus-review. No write tool. The runner is deferred. |
| **Not automatable yet** | Neither route pays off | Technical work stays human; the product's economics are re-planned on that basis (design §15) |
| **Untested** | Access not granted | Recorded as untested. The Technical Agent's scope stays undecided. |

---

## Schedule and effort

- **Start:** both in the same week once access arrives. A0–A2 and E0–E1 have no write risk and can run first.
- **Time boxes (elapsed, not effort):**
  - A: up to 5 working days, inside its spike window;
  - E: up to 10 working days, including CNC turnaround.
- **Engineering effort:**
  - B-9 (the A0–A2 real read and environment profile) is estimated at 2 / 4 / 8 person-days (low / base / high);
  - the rest of A and all of E are **measured, not estimated** (Stage 2 rule). The measurements are the output.
- **Decisions:** D-3 (access and isolation), D-4 (representative request sample), D-8 (runner, decided after E).
