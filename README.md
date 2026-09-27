# Jade by ConsultIQ — frontend

React + TypeScript + Vite. Talks to Jade's backend (the backend repository's
`scripts/run_local_preview.sh` starts both, from the latest `main`). The
footer shows the frontend and backend commits that are actually running.

An in-browser sample-data mode still exists for UI development only. It runs
only with `VITE_USE_MOCK_API=true`, and every page then carries a red
"Demo mode" banner. It is never the default and is not deployed.

## Run it

```
npm install
npm run dev          # http://localhost:5173
```

## Build it

```
npm run build              # dist/ — normal static build, host anywhere
npm run build:singlefile   # dist/index.html — one self-contained file
```

Both are static. To host on consultiq.nl, upload `dist/` to any static
host (Netlify, Vercel, S3+CloudFront, or plain nginx) and point a
subdomain such as `jade.consultiq.nl` at it.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds and deploys `dist/` on every
push to `main`. It needs the repo's Pages source set to "GitHub Actions"
once (Settings → Pages → Build and deployment → Source), after which the
workflow deploys automatically — no manual `gh-pages` branch to manage.
`vite.config.ts` already uses `base: "./"`, so the build works unchanged
under a project-page subpath such as `https://<org>.github.io/<repo>/`.

Served at `jade.consultiq.nl` — `public/CNAME` carries the domain into
every build, and it's set as the custom domain under Settings → Pages.
The DNS side (a `CNAME` record at the registrar pointing the subdomain
at `<org>.github.io`) is not part of this repo.

## How it is wired for the backend

Everything the UI needs is declared in one interface:

```
src/services/api.ts      ChangeFactoryApi + API_ENDPOINTS + `export const api`
src/services/mockApi.ts  the mock implementation used today
src/types/domain.ts      the domain model (mirrors design doc Sections 6.1-6.6)
```

No component imports mock data. Every page calls `api.*`. To connect the
FastAPI backend:

1. Write `HttpChangeFactoryApi` implementing `ChangeFactoryApi` with `fetch`.
2. Change the last line of `src/services/api.ts` to export it instead.

That is the whole integration surface. The endpoint paths the backend is
expected to expose are listed in `API_ENDPOINTS` in the same file.

## Structure

```
src/types/domain.ts        Change, Lifecycle, NextAction, MyWork, UserStory, ...
src/services/              api interface, HTTP and mock implementations
src/router.tsx             small History-API router (hash mode for file:// builds)
src/components/design.tsx  page building blocks: headers, sections, drawers,
                           lifecycle stepper, health, empty/error/loading states
src/components/ui.tsx      provenance blocks, modal, older shared widgets
src/pages/stories/         the Story Workspace (Overview, Business Story,
                           Solution, Delivery, Evidence & History, Technical)
src/pages/work/            My Work
src/pages/admin/           Administration, grouped by responsibility
src/styles.css             design tokens: ConsultIQ yellow for decisions,
                           Jade emerald for navigation and progress
```

## Routes

Every screen has a permanent address, so a link can be shared and the
browser's Back button works:

| Address | Screen | Role |
|---|---|---|
| `/work` | My Work: what needs you, what waits on others, what JADE is doing | everyone |
| `/stories`, `/stories?phase=understand`, `/stories/new` | Business Demand: User Stories, Requests, New request | Domain Owner (everyone can follow) |
| `/stories/review` | User Story Review: the Domain Owner's decision | Domain Owner |
| `/stories/:id[/business\|solution\|delivery\|evidence\|technical]` | A story. Solution, Delivery and Technical are Application Management's and are not shown to a Domain Owner | everyone |
| `/am` | Application Management dashboard | Application Manager (and Admin, CNC) |
| `/am/backlog-review`, `/am/architecture-review` | Governance: Gate 1 and Gate 2 | Application Manager |
| `/am/delivery-queue`, `/am/process`, `/am/technical`, `/am/as-built`, `/am/changes?stage=active\|validation\|release\|completed` | Delivery and Release | Application Manager, CNC |
| `/am/changes/:id` | The change record | Application Manager |
| `/business`, `/knowledge`, `/reports`, `/search?q=` | Business Architecture, Knowledge, Reports, Search | everyone |
| `/admin/:section[/:tab]` | Administration | Jade Administrator only |

The two journeys stay separate, as the operating model requires. The Domain Owner's journey ends at an approved story. The Application Manager takes it from there. Gate decisions are made on their own screens (User Story Review, Backlog Review, Architecture Review, Technical Work, As-built Records). A story's Next Step card says what is needed and opens the right screen.

Each story's phase, health and next step come from one place: the
backend's canonical lifecycle (`change.lifecycle`). Screens never derive
their own status.

The dev server and a normal build use base `/`, and the build also writes
`404.html` so static hosts serve deep links. The single-file build keeps
base `./` and falls back to `#/` addresses.

## Two rules the UI enforces visually

**Provenance.** Every block of content is wrapped in a `<Provenance>`
marker saying where it came from: as submitted, AI recommendation,
human decision, proposed change, or applied to JD Edwards. The colours
differ deliberately. A reader should never mistake a recommendation for
something that actually happened in JDE.

**Approval is a record, not a status flag.** Approving a story and
approving the exact change are two separate decisions, each captured
with a named person, a timestamp and a reason. The exact-change panel
shows the hash the approval is bound to. This mirrors the Approval
Record in the design document (Section 6.5) so the UI does not have to
be reworked when the real backend enforces it.

## Charts

Hand-drawn SVG in `components/ui.tsx` — no chart library, so there is
no dependency to keep current and the styling matches the brand exactly.
Report figures are computed from the change records in `mockApi.ts`,
never hard-coded, so they will behave the same against the real API.

## Customer scoping (multi-tenancy)

The app is customer-scoped throughout. The active customer comes from
the authenticated user's context, not from a picker the user is
expected to set.

- **One customer** → the header shows a plain label. No selector,
  because there is no choice to make.
- **More than one** → the same spot becomes a dropdown listing only the
  engagements that user is entitled to.

Both are the one `CustomerScope` component, driven by
`session.customers.length`. Nothing in the pages knows about customers;
they call `api.*` and get the active customer's data.

`src/services/session.ts` holds two prototype personas so both paths
can be demonstrated: a single-customer Application Manager, and a
ConsultIQ consultant with three engagements. Switch between them with
the control in the footer or `?persona=consultant` /
`?persona=customer-user`. That control is prototype scaffolding and
disappears once real sign-in exists.

### What the backend must do — this part is not optional

The service layer sends the active customer as an `X-Customer-Id`
header (see `CUSTOMER_SCOPE_HEADER` in `src/services/api.ts`).

**The backend must treat that header as an assertion to verify, never
as an instruction to obey.** On every request it must:

1. Resolve the caller's identity from the auth token.
2. Look up which customers that identity is entitled to, server-side.
3. Reject the request if the header names a customer outside that set.
4. Apply the customer as a filter on every query and every write.

If the header alone were enough to change scope, switching customer
would be a client-side edit and any consultant could read any
customer's estate. The mock enforces the same rule —
`setMockActiveCustomer` throws for an unentitled customer — so the
behaviour is identical once the real API is connected.

Corresponding changes needed in the Python engine:

- `scope.json` becomes one file per customer. It already describes a
  single engagement's approved applications, versions and options
  (design doc Appendix D.2/E.2), so it is per-customer by nature.
- `backlog/`, `changes/` and `evidence/` become per-customer
  directories, so one customer's records cannot be read or written
  while another is active.
- The JDE AIS service account is already per-environment; it becomes
  per-customer too, since each engagement has its own JDE estate.

This matches design document Section 15.10, which lists customer
isolation of knowledge, credentials, scope and evidence as a
requirement before productisation.
