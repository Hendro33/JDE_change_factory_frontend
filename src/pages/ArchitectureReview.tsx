import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Change } from "../types/domain";
import { ChangeGrid, FilterBar, useChangeListControls, type GridColumn } from "../components/WorkQueue";
import { ConfirmDialog, Loading, PriorityBadge, Provenance } from "../components/ui";

/**
 * Architecture Review — Gate 2. The Architect has already analysed the
 * JDE estate and proposed exactly one operation; a human reviews that
 * reasoning and either approves or rejects the specific write, before
 * anything reaches JD Edwards.
 */
export function ArchitectureReview() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    api.listChanges().then((all) => {
      const queue = all.filter((c) => c.architectDecision || c.exactChange);
      setChanges(queue);
      setOpenId((cur) => (cur && queue.some((c) => c.id === cur) ? cur : queue[0]?.id ?? null));
    });
  };
  useEffect(reload, []);

  const columns: GridColumn[] = [
    { key: "id", header: "Change", render: (c) => <span className="mono">{c.id}</span>, sortValue: (c) => c.id },
    { key: "title", header: "Title", render: (c) => c.title, sortValue: (c) => c.title },
    { key: "route", header: "Route", render: (c) => c.architectDecision?.recommendedRoute ?? <span className="notstated">not decided</span> },
    { key: "decision", header: "Exact change", render: (c) =>
      c.changeApproval?.status === "approved" ? <span className="badge ok">Approved</span>
        : c.changeApproval?.status === "rejected" ? <span className="badge stop">Rejected</span>
        : c.exactChange ? <span className="badge warn">Awaiting your decision</span>
        : <span className="badge grey">Not proposed yet</span> },
    { key: "priority", header: "Priority", render: (c) => <PriorityBadge priority={c.priority} /> },
  ];

  const { search, setSearch, sortKey, sortDir, onSortChange, filtered } = useChangeListControls(
    changes ?? [], columns, (c) => `${c.id} ${c.title}`
  );

  // Awaiting-decision items first — that's the actual work on this screen.
  const sorted = [...filtered].sort((a, b) => {
    const aw = a.exactChange && !a.changeApproval ? 0 : 1;
    const bw = b.exactChange && !b.changeApproval ? 0 : 1;
    return aw - bw;
  });

  const open = changes?.find((c) => c.id === openId) ?? null;
  const ec = open?.exactChange;
  const decided = open?.changeApproval?.status === "approved" || open?.changeApproval?.status === "rejected";

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Architecture Review</h1>
          <div className="sub">
            Gate 2 — the Architect's recommendation and the one exact operation it proposes.
          </div>
        </div>
        <div className="meta">
          {changes?.filter((c) => c.exactChange && !c.changeApproval).length ?? 0} awaiting your decision
        </div>
      </div>

      {changes && changes.length > 0 && (
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search by ID or title" selects={[]} />
      )}

      {!changes ? <Loading what="changes under architecture review" /> : (
        <section className="panel" style={{ marginBottom: 16 }}>
          <ChangeGrid
            changes={sorted}
            columns={columns}
            onRowClick={setOpenId}
            selectedId={openId}
            emptyMessage="Nothing here yet. A change arrives once Backlog Review has approved it for delivery and the Architect has analysed it."
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </section>
      )}

      {open && (
        <div className="stack">
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
                <div className="mono" style={{ color: "var(--muted)" }}>{open.id}</div>
              </div>
              <PriorityBadge priority={open.priority} />
            </div>
          </section>

          {open.architectDecision ? (
            <section className="panel">
              <h2>Architect recommendation</h2>
              <Provenance kind="ai" label={`Recommended route: ${open.architectDecision.recommendedRoute} · confidence ${Math.round(open.architectDecision.confidence * 100)}%`}>
                <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>{open.architectDecision.existingFunctionalityFound}</p>
                {open.architectDecision.alternativesConsidered.length > 0 && (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Why not the simpler options</div>
                    <table className="data">
                      <thead><tr><th>Considered</th><th>Why it was not selected</th></tr></thead>
                      <tbody>
                        {open.architectDecision.alternativesConsidered.map((a, i) => (
                          <tr key={i}><td>{a.approach}</td><td>{a.whyNot}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Provenance>
              <dl className="facts" style={{ marginTop: 14 }}>
                <dt>Objects affected</dt>
                <dd>{open.architectDecision.objectsAffected.length
                  ? <span className="mono">{open.architectDecision.objectsAffected.join(", ")}</span>
                  : "None"}</dd>
                <dt>Could break</dt>
                <dd>{open.architectDecision.dependenciesAndConflicts.length
                  ? open.architectDecision.dependenciesAndConflicts.join("; ")
                  : "Nothing identified"}</dd>
                <dt>Rollback</dt><dd>{open.architectDecision.rollbackStrategy}</dd>
              </dl>
            </section>
          ) : (
            <section className="panel">
              <div className="callout">
                <strong>Architecture Review has not produced a recommendation yet</strong>
                This can take a few minutes after Backlog Review approval — check back shortly.
              </div>
            </section>
          )}

          {open.implementationSpec && (
            <section className="panel">
              <h2>Implementation specification</h2>
              <dl className="facts">
                <dt>Sequence</dt>
                <dd>
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    {open.implementationSpec.sequence.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </dd>
                <dt>MCP operations</dt>
                <dd className="mono">{open.implementationSpec.requiredMcpOperations.join(", ") || "None"}</dd>
                <dt>Human actions required</dt>
                <dd>{open.implementationSpec.humanActionsRequired.join("; ") || "None"}</dd>
                <dt>Validation approach</dt>
                <dd>{open.implementationSpec.validationApproach}</dd>
              </dl>
            </section>
          )}

          {ec && (
            <section className="panel">
              <h2>The exact change</h2>
              <Provenance
                kind={decided ? "executed" : "proposed"}
                label={decided ? `Decision recorded — ${open.changeApproval!.status}` : "Proposed only — nothing has been written to JD Edwards"}
              >
                <dl className="facts">
                  <dt>Operation</dt><dd className="mono">{ec.tool}</dd>
                  <dt>Application</dt><dd className="mono">{ec.application}</dd>
                  <dt>Version</dt><dd className="mono">{ec.version}</dd>
                  <dt>Processing option</dt><dd className="mono">{ec.option}</dd>
                  <dt>Current value</dt><dd className="mono">{ec.currentValue}</dd>
                  <dt>Proposed value</dt><dd className="mono"><strong>{ec.proposedValue}</strong></dd>
                  <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
                  <dt>Verified by</dt><dd className="mono">{ec.testOrchestration}</dd>
                </dl>
              </Provenance>

              {open.changeApproval ? (
                <div style={{ marginTop: 12 }}>
                  <Provenance
                    kind="human"
                    label={`Exact change ${open.changeApproval.status} by ${open.changeApproval.approvedBy} · ${open.changeApproval.approvedAt ? new Date(open.changeApproval.approvedAt).toLocaleString("en-GB") : ""}`}
                  >
                    <div style={{ fontSize: 13.5 }}>
                      {open.changeApproval.note || <span className="notstated">no note recorded</span>}
                    </div>
                  </Provenance>
                </div>
              ) : (
                <div className="btnrow" style={{ marginTop: 16 }}>
                  <button className="btn primary" onClick={() => setDialog("approve")} disabled={busy}>
                    Approve exact change
                  </button>
                  <button className="btn danger" onClick={() => setDialog("reject")} disabled={busy}>
                    Reject exact change
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {dialog && open && ec && (
        <ConfirmDialog
          title={dialog === "approve" ? "Approve this exact change?" : "Reject this exact change?"}
          intro={
            <>
              <p style={{ marginTop: 0 }}>
                {dialog === "approve"
                  ? "You are approving one specific operation, not the change in general."
                  : "The Architect will need to propose a different operation, or this may need Human Implementation."}
              </p>
              <dl className="facts">
                <dt>Application</dt><dd className="mono">{ec.application}</dd>
                <dt>Version</dt><dd className="mono">{ec.version}</dd>
                <dt>Option</dt><dd className="mono">{ec.option}</dd>
                <dt>Change</dt><dd className="mono">{ec.currentValue} → <strong>{ec.proposedValue}</strong></dd>
              </dl>
            </>
          }
          whatHappensNext={
            dialog === "approve"
              ? "The Functional or Technical Agent may apply exactly this operation in DEV, then run the named test. If anything about the operation differs from what you see here, it will be refused."
              : "This exact operation is refused. Nothing is written to JD Edwards."
          }
          confirmLabel={dialog === "approve" ? "Approve exact change" : "Reject exact change"}
          tone={dialog === "approve" ? "primary" : "danger"}
          requireNote={dialog === "reject"}
          showReasonCode={dialog === "reject"}
          onCancel={() => setDialog(null)}
          onConfirm={async (decidedBy, note, reasonCode) => {
            setDialog(null); setBusy(true);
            if (dialog === "approve") await api.approveExactChange(open.id, { decidedBy, note });
            else await api.rejectExactChange(open.id, { decidedBy, note, rejectionReason: reasonCode });
            await reload(); setBusy(false);
          }}
        />
      )}
    </>
  );
}
