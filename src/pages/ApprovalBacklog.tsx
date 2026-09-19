import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Change } from "../types/domain";
import {
  ApiNote,
  ConfirmDialog,
  Loading,
  NotStated,
  PriorityBadge,
  Provenance,
} from "../components/ui";

type Decision = "approve" | "reject" | "sendback";

export function ApprovalBacklog() {
  const [backlog, setBacklog] = useState<Change[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => api.getBacklog().then((b) => {
    setBacklog(b);
    setOpenId((cur) => (cur && b.some((c) => c.id === cur) ? cur : b[0]?.id ?? null));
  });

  useEffect(() => { reload(); }, []);

  const open = backlog?.find((c) => c.id === openId) ?? null;

  const COPY: Record<Decision, { title: string; next: string; label: string; tone: "primary" | "danger"; note: boolean }> = {
    approve: {
      title: "Approve this change for implementation?",
      next: "The Architect analyses it and proposes an exact change. You will approve that separately before anything is written to JD Edwards.",
      label: "Approve", tone: "primary", note: false,
    },
    reject: {
      title: "Reject this change?",
      next: "The change is closed with your reason recorded. If the need stands, it re-enters as a fresh request.",
      label: "Reject", tone: "danger", note: true,
    },
    sendback: {
      title: "Send back for refinement?",
      next: "It returns to story enhancement with your reason attached.",
      label: "Send back", tone: "danger", note: true,
    },
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Approval &amp; backlog</h1>
          <div className="sub">
            You decide what is worth doing. Nothing proceeds without this decision.
          </div>
        </div>
        <div className="meta">{backlog?.length ?? 0} awaiting your review</div>
      </div>

      {!backlog ? <Loading what="the backlog" /> : backlog.length === 0 ? (
        <div className="empty">
          Nothing waiting for review. Stories arrive here once they pass the quality gate.
        </div>
      ) : (
        <div className="detailgrid">
          <div className="stack">
            {open && (
              <>
                <section className="panel">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
                      <div className="mono" style={{ color: "var(--muted)" }}>
                        {open.id} · {open.source} · {open.sourceReference || "no reference"} ·
                        raised {new Date(open.createdAt).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <PriorityBadge priority={open.priority} />
                      <span className="badge grey">Complexity: {open.complexitySignal}</span>
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <h2>What you are approving</h2>
                  <Provenance kind="plain" label="Original request — as submitted">
                    <div style={{ fontSize: 13.5 }}>{open.originalRequest}</div>
                  </Provenance>
                  {open.userStory && (
                    <div style={{ marginTop: 12 }}>
                      <Provenance kind="ai" label="Story written by the factory from that request">
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
                  <h2>Your decision</h2>
                  <div className="callout" style={{ marginBottom: 16 }}>
                    <strong>What happens next if you approve</strong>
                    The Architect analyses the JD Edwards estate and proposes an exact change.
                    That proposal comes back to you for a separate approval. Approving here does
                    not authorise any write to JD Edwards.
                  </div>
                  <div className="btnrow">
                    <button className="btn primary" onClick={() => setDialog("approve")} disabled={busy}>Approve</button>
                    <button className="btn" onClick={() => setDialog("sendback")} disabled={busy}>Send back for refinement</button>
                    <button className="btn danger" onClick={() => setDialog("reject")} disabled={busy}>Reject</button>
                  </div>
                  <ApiNote endpoint="POST /changes/{id}/approve · POST /changes/{id}/reject" />
                </section>
              </>
            )}
          </div>

          <aside className="panel">
            <h2>Awaiting review</h2>
            <table className="data">
              <tbody>
                {backlog.map((c) => (
                  <tr key={c.id} className="clickable"
                    style={c.id === openId ? { background: "var(--wash)" } : undefined}
                    onClick={() => setOpenId(c.id)}>
                    <td>
                      <div className="mono" style={{ color: "var(--muted)" }}>{c.id}</div>
                      <div>{c.title}</div>
                      <div style={{ marginTop: 5, display: "flex", gap: 6 }}>
                        <PriorityBadge priority={c.priority} />
                        <span className="badge grey">Complexity: {c.complexitySignal}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ApiNote endpoint="GET /backlog" />
          </aside>
        </div>
      )}

      {dialog && open && (
        <ConfirmDialog
          title={COPY[dialog].title}
          intro={
            <>
              <p style={{ marginTop: 0 }}><strong>{open.title}</strong> ({open.id})</p>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{open.userStory?.statement ?? open.originalRequest}</p>
            </>
          }
          whatHappensNext={COPY[dialog].next}
          confirmLabel={COPY[dialog].label}
          tone={COPY[dialog].tone}
          requireNote={COPY[dialog].note}
          onCancel={() => setDialog(null)}
          onConfirm={async (decidedBy, note) => {
            setDialog(null); setBusy(true);
            if (dialog === "approve") await api.approveChange(open.id, { decidedBy, note });
            else if (dialog === "reject") await api.rejectChange(open.id, { decidedBy, note });
            else await api.sendStoryBack(open.id, { decidedBy, note });
            await reload(); setBusy(false);
          }}
        />
      )}
    </>
  );
}
