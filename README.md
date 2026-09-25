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
src/types/domain.ts        Change, UserStory, ApprovalRecord, EvidenceRecord, ...
src/services/              api interface, mock implementation, mock records
src/components/ui.tsx      badges, KPI, charts, provenance blocks, timeline, modal
src/pages/                 Dashboard, StoryEnhancement, ApprovalBacklog,
                           BuildStatus, ChangeDetail
src/styles.css             ConsultIQ brand: white, #FFCC00, black, Arial
```

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
Dashboard metrics are computed from the change records in `mockApi.ts`,
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
