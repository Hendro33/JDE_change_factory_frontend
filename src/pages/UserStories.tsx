import { Fragment, useEffect, useMemo, useState } from "react";
import { api, IS_MOCK_MODE } from "../services/api";
import { DocumentCitations, DraftDocuments, RequestDocuments } from "../components/RequestDocuments";
import type { Attachment } from "../services/aiApi";
import { saveErrorMessage } from "../services/saveErrors";
import type { BusinessDomain, Change, ChangeSource, JiraConnectionStatus, JiraSyncResult } from "../types/domain";
import type { NavTarget } from "../types/nav";
import {
  ChangeGrid,
  FilterBar,
  useChangeListControls,
  type GridColumn,
} from "../components/WorkQueue";
import {
  FlowSteps,
  Loading,
  NotStated,
  Provenance,
  StateBadge,
  stateLabel,
} from "../components/ui";

const SOURCES: ChangeSource[] = ["Business", "Support / Topdesk", "Optimisation", "DevOps"];
const STEPS = ["Received", "Refining", "Backlog ready"];

const RUNNING_STAGES = ["receiving", "improving", "checking"] as const;
const STAGE_LABEL: Record<string, string> = {
  receiving: "Receive Agent running…",
  improving: "Improve Agent running…",
  checking: "Check Agent running…",
};

type View = "all" | "requests";

const VIEW_COPY: Record<View, { title: string; sub: string; empty: string }> = {
  all: {
    title: "User Stories",
    sub: "Every request and the story Jade has written for it, at any stage.",
    empty: "No user stories yet.",
  },
  requests: {
    title: "Requests",
    sub: "Incoming requests that haven't been turned into a User Story yet.",
    empty: "No incoming requests waiting.",
  },
};

function baseListFor(view: View, all: Change[]): Change[] {
  if (view === "requests") return all.filter((c) => c.state === "RECEIVED");
  return all;
}

/**
 * Demand: Requests and User Stories — capturing a request and running
 * it through Receive/Improve/Check. Governance (is this the right
 * requirement? is it authorised for delivery?) lives on User Story
 * Review and Backlog Review, not here.
 */
export function UserStories({ onOpenChange, navFilter, navToken }: { onOpenChange: (id: string) => void } & NavTarget) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<ChangeSource>("Support / Topdesk");
  const [ref, setRef] = useState("");
  const [request, setRequest] = useState("");
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [view, setView] = useState<View>("all");
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [allDomains, setAllDomains] = useState<BusinessDomain[]>([]);

  // "Retrieve new requests" (Demand > Requests) -- the operational pull
  // action, reusing the SAME Jira sync service Admin > Integrations'
  // "Sync now" already calls. Configuration/credentials/testing stay on
  // Admin > Integrations; this is only the day-to-day "go get new demand"
  // button, manual for now (no polling/scheduling/webhooks).
  const [jiraStatus, setJiraStatus] = useState<JiraConnectionStatus | null>(null);
  const [retrieving, setRetrieving] = useState(false);
  const [retrieveResult, setRetrieveResult] = useState<JiraSyncResult | null>(null);
  const [retrieveError, setRetrieveError] = useState<string | null>(null);

  const reload = () => api.listChanges().then(setChanges);
  useEffect(() => {
    reload();
    api.listBusinessDomains().then(setAllDomains);
    api.getJiraIntegrationStatus().then(setJiraStatus);
  }, []);

  async function retrieveNewRequests() {
    setRetrieving(true);
    setRetrieveError(null);
    try {
      const result = await api.syncJiraIntegration();
      setRetrieveResult(result);
      await reload();
    } catch (e) {
      setRetrieveResult(null);
      setRetrieveError(e instanceof Error ? e.message : "Could not retrieve new requests.");
    } finally {
      setRetrieving(false);
    }
  }

  // Dashboard / nav items arrive here with a preset view, and "Create
  // Request" arrives with action: "create" to open the form directly —
  // the only way to reach it now that there's no floating button.
  useEffect(() => {
    if (!navFilter) return;
    if (navFilter.view === "all" || navFilter.view === "requests") setView(navFilter.view);
    setDomainFilter(navFilter.domainId ?? "");
    setCreating(navFilter.action === "create");
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);

  const domainsById = useMemo(() => new Map(allDomains.map((d) => [d.id, d])), [allDomains]);
  const domainFor = (c: Change) => (c.businessDomainId ? domainsById.get(c.businessDomainId) : undefined);

  const scoped = useMemo(() => baseListFor(view, changes ?? []), [view, changes]);
  const statusOptions = useMemo(
    () => Array.from(new Set(scoped.map((c) => c.state))).map((s) => ({ value: s, label: stateLabel(s) })),
    [scoped]
  );

  const columns: GridColumn[] = [
    { key: "id", header: "ID", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "Title", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "domain", header: "Business Domain", render: (c) => domainFor(c)?.name ?? <NotStated />, sortValue: (c) => domainFor(c)?.name ?? "" },
    { key: "status", header: "Status", render: (c) => <StateBadge state={c.state} /> },
    { key: "source", header: "Request source", render: (c) => `${c.source}${c.sourceReference ? " · " + c.sourceReference : ""}` },
    { key: "updated", header: "Updated", render: (c) => new Date(c.updatedAt).toLocaleDateString("en-GB"), sortValue: (c) => c.updatedAt },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    scoped, columns, (c) => `${c.id} ${c.title}`
  );
  const gridRows = filtered.filter(
    (c) => (!domainFilter || c.businessDomainId === domainFilter) && (!statusFilter || c.state === statusFilter)
  );

  useEffect(() => {
    setSelectedId((cur) => (cur && gridRows.some((c) => c.id === cur) ? cur : gridRows[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRows.length, view]);

  const selected = changes?.find((c) => c.id === selectedId) ?? null;
  const stepIndex = selected
    ? selected.state === "RECEIVED" ? 0 : selected.state === "REFINING" ? 1 : 2
    : 0;

  // Real Receive/Improve/Check runs happen on the backend and can take
  // minutes (they're real model calls) -- enhanceStory() below only
  // starts the run. While it's active, poll for progress rather than
  // block the UI on one long request.
  const runningStage = selected?.processingStage;
  useEffect(() => {
    if (!selected || !runningStage || !(RUNNING_STAGES as readonly string[]).includes(runningStage)) return;
    const id = selected.id;
    const timer = setInterval(async () => {
      const updated = await api.getChange(id);
      if (!updated) return;
      setChanges((cur) => cur?.map((c) => (c.id === id ? updated : c)) ?? cur);
    }, 2000);
    return () => clearInterval(timer);
  }, [selected?.id, runningStage]);

  async function createStory() {
    if (!title.trim() || !request.trim()) return;
    setBusy(true);
    setCreateError(null);
    let created;
    try {
      created = await api.createChange({
        title: title.trim(), source, sourceReference: ref.trim(), originalRequest: request.trim(),
        attachmentIds: docs.map((d) => d.id),
      });
    } catch (e) {
      // Nothing is lost: the form and its uploaded documents stay as they are.
      setCreateError(saveErrorMessage(e, "The request could not be created."));
      setBusy(false);
      return;
    }
    setTitle(""); setRef(""); setRequest(""); setDocs([]); setCreating(false);
    await reload();
    setView("all");
    setSelectedId(created.id);
    setBusy(false);
  }

  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  useEffect(() => setEnhanceError(null), [selectedId]);
  async function enhance() {
    if (!selected) return;
    setBusy(true);
    setEnhanceError(null);
    try {
      await api.enhanceStory(selected.id);
    } catch (e) {
      // e.g. no AI connection, no Start-up Pack, agent switched off: nothing was started.
      setEnhanceError(saveErrorMessage(e, "The agents could not be started."));
    }
    await reload();
    setBusy(false);
  }

  const copy = VIEW_COPY[view];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{copy.title}</h1>
          <div className="sub">{copy.sub}</div>
        </div>
        {view === "requests" && (
          <div style={{ textAlign: "right" }}>
            <button
              className="btn primary"
              disabled={retrieving || jiraStatus?.state === "unavailable"}
              onClick={retrieveNewRequests}
            >
              {retrieving ? "Retrieving…" : "Retrieve new requests"}
            </button>
            {jiraStatus?.state === "unavailable" && (
              <div className="hint" style={{ marginTop: 6 }}>
                Jira is unavailable for this company: {jiraStatus.unavailableReason}
              </div>
            )}
            {jiraStatus?.state === "demo" && (
              <div className="hint" style={{ marginTop: 6 }}>Demo mode: requests come from a simulated Jira.</div>
            )}
          </div>
        )}
      </div>

      {view === "requests" && (retrieveResult || retrieveError) && (
        <section className="panel" style={{ marginBottom: 16 }}>
          {retrieveError ? (
            <div className="callout" style={{ borderColor: "var(--stop)" }}>
              <strong>Could not retrieve new requests</strong>
              {retrieveError}
            </div>
          ) : retrieveResult && (
            <div className="callout">
              <strong>
                {retrieveResult.imported.length} new request{retrieveResult.imported.length === 1 ? "" : "s"} imported
              </strong>
              {retrieveResult.considered} ticket{retrieveResult.considered === 1 ? "" : "s"} found in Jira's configured pickup status.
              {retrieveResult.errors.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {retrieveResult.errors.map((e, i) => (
                    <li key={i}><span className="mono">{e.issueKey}</span>: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {creating && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>New change request</h2>
          <div className="grid halves">
            <div>
              <div className="field">
                <label htmlFor="t">Short title</label>
                <input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Update SO default document type" />
              </div>
              <div className="field">
                <label htmlFor="s">Where did this come from?</label>
                <select id="s" value={source} onChange={(e) => setSource(e.target.value as ChangeSource)}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="r">Reference <span className="hint">(ticket number, email, meeting)</span></label>
                <input id="r" type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. Topdesk #4521" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="req">The request, in the requester's own words</label>
              <textarea id="req" value={request} onChange={(e) => setRequest(e.target.value)}
                placeholder="Paste the ticket text or note exactly as it was written. Don't tidy it up — Jade works better with the original wording." />
            </div>
          </div>
          {!IS_MOCK_MODE && <DraftDocuments value={docs} onChange={setDocs} />}
          {createError && <div className="badge stop" role="alert">{createError}</div>}
          <div className="btnrow">
            <button className="btn primary" disabled={!title.trim() || !request.trim() || busy} onClick={createStory}>
              {busy ? "Creating…" : "Create story"}
            </button>
            <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </section>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by ID or title"
        selects={[
          { key: "view", label: "View", value: view, onChange: (v) => setView(v as View), options: [
            { value: "all", label: "All User Stories" },
            { value: "requests", label: "Requests (not yet refined)" },
          ] },
          { key: "domain", label: "Business Domain", value: domainFilter, onChange: setDomainFilter, options: [
            { value: "", label: "All domains" },
            ...allDomains.map((d) => ({ value: d.id, label: d.name })),
          ] },
          { key: "status", label: "Status", value: statusFilter, onChange: setStatusFilter, options: [
            { value: "", label: "All statuses" },
            ...statusOptions,
          ] },
        ]}
        onClear={() => { setSearch(""); setDomainFilter(""); setStatusFilter(""); }}
      />

      {!changes ? <Loading what="stories" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid
            changes={gridRows}
            columns={columns}
            onRowClick={setSelectedId}
            selectedId={selectedId}
            emptyMessage={copy.empty}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </section>
      )}

      {selected && (
        <div className="stack">
          <section className="panel">
            <FlowSteps steps={STEPS} currentIndex={stepIndex} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{selected.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>
                  {selected.id} · {selected.source} · {selected.sourceReference || "no reference"}
                </div>
              </div>
              <StateBadge state={selected.state} />
            </div>

            <div style={{ marginTop: 16 }}>
              <Provenance kind="plain" label="Original request — as submitted">
                <div style={{ fontSize: 13.5 }}>{selected.originalRequest}</div>
              </Provenance>
            </div>

            {!IS_MOCK_MODE && <div style={{ marginTop: 12 }}><RequestDocuments requestId={selected.id} /></div>}

            {selected.sourceMetadata && Object.keys(selected.sourceMetadata).length > 0 && (
              <dl className="facts" style={{ marginTop: 12 }}>
                {Object.entries(selected.sourceMetadata).map(([key, value]) => (
                  <Fragment key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              </dl>
            )}

            {!selected.userStory && (
              <div className="btnrow" style={{ marginTop: 16, alignItems: "center" }}>
                {runningStage && (RUNNING_STAGES as readonly string[]).includes(runningStage) ? (
                  <>
                    <span className="badge warn">{STAGE_LABEL[runningStage]}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      Real agents are running — this can take a few minutes.
                    </span>
                  </>
                ) : (
                  <>
                    <button className="btn primary" onClick={enhance} disabled={busy}>
                      {busy ? "Starting…" : "Enhance story"}
                    </button>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      Runs Receive → Improve → Check on the request above.
                    </span>
                  </>
                )}
              </div>
            )}
            {enhanceError && (
              <div className="callout" role="alert" style={{ marginTop: 14 }}>
                <strong>Not started</strong>
                {enhanceError}
              </div>
            )}
            {selected.processingStage === "failed" && (
              <div className="callout" style={{ marginTop: 14 }}>
                <strong>Enhancement failed</strong>
                {selected.processingError || "Something went wrong running the agents."}
              </div>
            )}
          </section>

          {selected.userStory && (
            <section className="panel">
              <h2>Enhanced story</h2>
              <Provenance kind="ai">
                <p style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 700 }}>
                  {selected.userStory.statement}
                </p>
                <p style={{ margin: 0, fontSize: 13.5 }}>{selected.userStory.businessContext}</p>
              </Provenance>

              <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Acceptance criteria</h3>
              {selected.userStory.acceptanceCriteria.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>
                  None yet — the story cannot pass the quality gate without testable criteria.
                </div>
              ) : (
                <table className="data">
                  <thead><tr><th>#</th><th>Criterion</th><th>Verified by</th></tr></thead>
                  <tbody>
                    {selected.userStory.acceptanceCriteria.map((ac) => (
                      <tr key={ac.id}>
                        <td className="mono">{ac.id}</td>
                        <td>{ac.text}</td>
                        <td className="mono">{ac.verifiedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Test script</h3>
              {selected.userStory.testScript.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>No test steps yet.</div>
              ) : (
                <table className="data">
                  <thead><tr><th>#</th><th>Action</th><th>Expected result</th></tr></thead>
                  <tbody>
                    {selected.userStory.testScript.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">{t.id}</td><td>{t.action}</td><td>{t.expected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selected.userStory.businessRules.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Business rules &amp; constraints</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                    {selected.userStory.businessRules.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </>
              )}

              {selected.userStory.assumptions.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Assumptions</h3>
                  <Provenance kind="ai" label="Jade is treating these as true — confirm or correct">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                      {selected.userStory.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </Provenance>
                </>
              )}

              {selected.userStory.openQuestions.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Still missing</h3>
                  <Provenance kind="ai" label="Jade could not answer these from the request">
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                      {selected.userStory.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </Provenance>
                </>
              )}

              <DocumentCitations citations={selected.userStory.documentCitations} />

              {selected.state === "BACKLOG_READY" && (
                <div className="callout" style={{ marginTop: 18 }}>
                  <strong>In the backlog</strong>
                  This story has passed the quality gate and is waiting on User Story Review
                  (Governance) for the Domain Owner's decision.
                </div>
              )}
            </section>
          )}

          <div className="btnrow">
            <button className="linkish" onClick={() => onOpenChange(selected.id)}>Open full change detail →</button>
          </div>
        </div>
      )}
    </>
  );
}
