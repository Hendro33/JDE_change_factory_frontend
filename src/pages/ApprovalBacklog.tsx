import { useEffect, useState } from "react";
import { api } from "../services/api";
import { ownersOf } from "./BusinessDomains";
import type { BusinessDomain, Change, DomainReview } from "../types/domain";
import type { NavTarget } from "../types/nav";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../components/WorkQueue";
import {
  ConfirmDialog,
  DOMAIN_STAGE_LABEL,
  Loading,
  NotStated,
  PriorityBadge,
  Provenance,
} from "../components/ui";

export function ApprovalBacklog({ navFilter, navToken }: NavTarget) {
  const [backlog, setBacklog] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [reviews, setReviews] = useState<Map<string, DomainReview>>(new Map());
  const [filterDomainId, setFilterDomainId] = useState("");
  // Defaults to just the business-approved backlog — the actual Gate 1
  // queue — rather than every story still mid Domain Owner review.
  // "All stages" is one filter click away for anyone who wants context.
  const [filterStage, setFilterStage] = useState("ready_for_application_manager");

  const reload = () => api.getBacklog().then(async (b) => {
    setBacklog(b);
    setOpenId((cur) => (cur && b.some((c) => c.id === cur) ? cur : b[0]?.id ?? null));
    api.listBusinessDomains().then(setDomains);
    const pairs = await Promise.all(b.map(async (c) => [c.id, await api.getDomainReview(c.id)] as const));
    setReviews(new Map(pairs.filter((p): p is [string, DomainReview] => !!p[1])));
  });

  useEffect(() => { reload(); }, []);

  // Dashboard navigates here with a stage/domain to pre-filter to (e.g.
  // "3 Backlog-ready User Stories").
  useEffect(() => {
    if (!navFilter) return;
    setFilterStage(navFilter.stage ?? "ready_for_application_manager");
    setFilterDomainId(navFilter.domainId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navToken]);

  const domainsById = new Map(domains.map((d) => [d.id, d]));

  const columns: GridColumn[] = [
    { key: "id", header: "ID", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "User Story", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "domain", header: "Business Domain", render: (c) => {
      const review = reviews.get(c.id);
      const domain = review?.businessDomainId ? domainsById.get(review.businessDomainId) : undefined;
      return review?.domainClassificationUncertain ? "Uncertain" : domain?.name ?? <NotStated />;
    } },
    { key: "owner", header: "Domain Owner", render: (c) => {
      const review = reviews.get(c.id);
      const domain = review?.businessDomainId ? domainsById.get(review.businessDomainId) : undefined;
      return ownersOf(domain);
    } },
    { key: "stage", header: "Status", render: (c) => {
      const review = reviews.get(c.id);
      return review ? <span className="badge warn">{DOMAIN_STAGE_LABEL[review.stage] ?? review.stage}</span> : <span className="badge grey">Not started</span>;
    } },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
    { key: "created", header: "Raised", render: (c) => new Date(c.createdAt).toLocaleDateString("en-GB"), sortValue: (c) => c.createdAt },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered: searchedAndSorted } = useChangeListControls(
    backlog ?? [], columns, (c) => `${c.id} ${c.title}`
  );

  const filtered = searchedAndSorted.filter((c) => {
    const review = reviews.get(c.id);
    if (filterDomainId && review?.businessDomainId !== filterDomainId) return false;
    if (filterStage && review?.stage !== filterStage) return false;
    return true;
  });

  useEffect(() => {
    setOpenId((cur) => (cur && filtered.some((c) => c.id === cur) ? cur : filtered[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length]);

  const open = filtered.find((c) => c.id === openId) ?? null;
  const openReview = open ? reviews.get(open.id) : undefined;
  const readyForDelivery = openReview?.stage === "ready_for_application_manager";

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Backlog Review</h1>
          <div className="sub">
            Application Manager Gate 1 — the business-approved backlog, waiting to be authorised for delivery.
          </div>
        </div>
        <div className="meta">{filtered.length} awaiting your review</div>
      </div>

      {backlog && backlog.length > 0 && (
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by ID or title"
          selects={[
            { key: "domain", label: "Business Domain", value: filterDomainId, onChange: setFilterDomainId, options: [
              { value: "", label: "All domains" },
              ...domains.map((d) => ({ value: d.id, label: d.name })),
            ] },
            { key: "stage", label: "Governance stage", value: filterStage, onChange: setFilterStage, options: [
              { value: "", label: "All stages" },
              ...Object.entries(DOMAIN_STAGE_LABEL).map(([stage, label]) => ({ value: stage, label })),
            ] },
          ]}
          onClear={() => { setSearch(""); setFilterDomainId(""); setFilterStage(""); }}
        />
      )}

      {!backlog ? <Loading what="the backlog" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid
            changes={filtered}
            columns={columns}
            onRowClick={setOpenId}
            selectedId={openId}
            emptyMessage={
              backlog.length === 0
                ? "Nothing waiting for review. Stories arrive here once they pass the quality gate."
                : "No changes match the current filters."
            }
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </section>
      )}

      {open && (
        <div className="stack">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>
                  {open.id} · {open.source} · {open.sourceReference || "no reference"} ·
                  raised {new Date(open.createdAt).toLocaleDateString("en-GB")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <PriorityBadge priority={open.priority} />
                <span className="badge grey">Complexity: {open.complexitySignal}</span>
                {openReview && (
                  <span className="badge info">
                    {openReview.domainClassificationUncertain
                      ? "Domain: uncertain"
                      : domainsById.get(openReview.businessDomainId ?? "")?.name ?? "Domain: unclassified"}
                  </span>
                )}
              </div>
            </div>
            {openReview && (
              <div style={{ marginTop: 10 }}>
                <span className="badge warn">{DOMAIN_STAGE_LABEL[openReview.stage] ?? openReview.stage}</span>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>What you are approving</h2>
            <Provenance kind="plain" label="Original request — as submitted">
              <div style={{ fontSize: 13.5 }}>{open.originalRequest}</div>
            </Provenance>
            {open.userStory && (
              <div style={{ marginTop: 12 }}>
                <Provenance kind="ai" label="Story written by Jade from that request">
                  <p style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700 }}>
                    {open.userStory.statement}
                  </p>
                  <p style={{ margin: 0, fontSize: 13.5 }}>{open.userStory.businessContext}</p>
                </Provenance>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Why it matters</h2>
            <dl className="facts">
              <dt>Financial impact</dt><dd>{open.businessImpact.financialImpact || <NotStated />}</dd>
              <dt>Operational reach</dt><dd>{open.businessImpact.operationalReach || <NotStated />}</dd>
              <dt>Risk &amp; compliance</dt><dd>{open.businessImpact.riskCompliance || <NotStated />}</dd>
              <dt>Strategic alignment</dt><dd>{open.businessImpact.strategicAlignment || <NotStated />}</dd>
              <dt>Urgency</dt><dd>{open.businessImpact.urgency || <NotStated />}</dd>
              <dt>Complexity signal</dt>
              <dd>
                {open.complexitySignal}
                <span style={{ color: "var(--muted)" }}> — a rough estimate, not a commitment. The Architect's analysis is the real answer.</span>
              </dd>
            </dl>
            <div className="apinote">
              Blank means the requester did not say. That is recorded honestly rather than
              guessed — weigh it as missing information, not as zero impact.
            </div>
          </section>

          {open.userStory && open.userStory.acceptanceCriteria.length > 0 && (
            <section className="panel">
              <h2>How success will be judged</h2>
              <table className="data">
                <thead><tr><th>#</th><th>Acceptance criterion</th></tr></thead>
                <tbody>
                  {open.userStory.acceptanceCriteria.map((ac) => (
                    <tr key={ac.id}><td className="mono">{ac.id}</td><td>{ac.text}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="panel">
            <h2>Your decision <span className="qualifier">— Application Manager</span></h2>
            <div className="callout" style={{ marginBottom: 16 }}>
              <strong>What happens next if you approve</strong>
              The change is admitted to the Delivery Queue — the set of approved work Jade is
              authorised to deliver, not a production deployment. The Architect then analyses the
              JD Edwards estate and proposes an exact change, which comes back to you for a
              separate approval before anything is written to JD Edwards.
            </div>
            {openReview && !readyForDelivery && (
              <div className="callout" style={{ marginBottom: 16 }}>
                <strong>Waiting on the Domain Owner</strong>
                This story is not yet ready for Application Manager approval — the Domain
                Owner has not approved the business requirement yet ({DOMAIN_STAGE_LABEL[openReview.stage] ?? openReview.stage}).
                Complete that review on User Story Review first.
              </div>
            )}
            <div className="btnrow">
              <button
                className="btn primary"
                onClick={() => setDialog(true)}
                disabled={busy || (!!openReview && !readyForDelivery)}
              >
                Approve for Delivery
              </button>
              <button
                className="btn danger"
                onClick={() => setRejectDialog(true)}
                disabled={busy || (!!openReview && !readyForDelivery)}
              >
                Reject
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && open && (
        <ConfirmDialog
          title="Approve this change for delivery?"
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{open.title}</strong> ({open.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{open.userStory?.statement ?? open.originalRequest}</p>
            </>
          }
          whatHappensNext="It's admitted to the Delivery Queue — the set of work Jade is authorised to deliver. The Architect then analyses it and proposes an exact change, which you approve separately on Architecture Review before anything is written to JD Edwards."
          confirmLabel="Approve for Delivery"
          tone="primary"
          requireNote={false}
          onCancel={() => setDialog(false)}
          onConfirm={async (note) => {
            setDialog(false); setBusy(true);
            await api.approveForDelivery(open.id, { note });
            await reload(); setBusy(false);
          }}
        />
      )}

      {rejectDialog && open && (
        <ConfirmDialog
          title="Reject this change?"
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{open.title}</strong> ({open.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{open.userStory?.statement ?? open.originalRequest}</p>
            </>
          }
          whatHappensNext="This is terminal — the change will not proceed and is never admitted to the Delivery Queue. This is different from a revision request: use this only when the work itself should not go ahead, not when the story just needs more detail."
          confirmLabel="Reject"
          tone="danger"
          requireNote={true}
          showReasonCode={true}
          onCancel={() => setRejectDialog(false)}
          onConfirm={async (note, rejectionReason) => {
            setRejectDialog(false); setBusy(true);
            await api.rejectForDelivery(open.id, { note, rejectionReason });
            await reload(); setBusy(false);
          }}
        />
      )}
    </>
  );
}
