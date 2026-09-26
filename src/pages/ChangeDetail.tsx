import { useEffect, useState } from "react";
import { api } from "../services/api";
import { ownersOf } from "./BusinessDomains";
import { ExecutionPanel } from "../components/ExecutionPanel";
import { DocumentCitations, RequestDocuments } from "../components/RequestDocuments";
import { IS_MOCK_MODE } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import type { BusinessDomain, Change, DomainReview } from "../types/domain";
import {
  ApiNote,
  CAPABILITY_STATUS_LABEL,
  CapabilityStatusBadge,
  ConfirmDialog,
  DOMAIN_STAGE_LABEL,
  Loading,
  NotStated,
  PriorityBadge,
  Provenance,
  StateBadge,
  Timeline,
  type TimelineItem,
} from "../components/ui";

/** The lifecycle, in order, as the business reads it. */
const LIFECYCLE: { key: string; title: string; reached: (c: Change) => boolean; detail: (c: Change) => string | undefined }[] = [
  {
    key: "request", title: "Request received",
    reached: () => true,
    detail: (c) => `${c.source} · ${c.sourceReference || "no reference"}`,
  },
  {
    key: "story", title: "User story written",
    reached: (c) => !!c.userStory,
    detail: (c) => c.userStory ? `Quality gate: ${c.userStory.qualityStatus.replace(/_/g, " ")}, ${c.userStory.revisionCount} revision(s)` : undefined,
  },
  {
    key: "backlog", title: "Business approval",
    reached: (c) => !!c.storyApproval,
    detail: (c) => c.storyApproval
      ? `${c.storyApproval.status === "approved" ? "Approved" : "Rejected"} by ${c.storyApproval.approvedBy}`
      : undefined,
  },
  {
    key: "architect", title: "Architect decision",
    reached: (c) => !!c.architectDecision,
    detail: (c) => c.architectDecision
      ? `${c.architectDecision.recommendedRoute} · confidence ${Math.round(c.architectDecision.confidence * 100)}%`
      : undefined,
  },
  {
    key: "spec", title: "Implementation specification",
    reached: (c) => !!c.implementationSpec,
    detail: (c) => c.implementationSpec ? `${c.implementationSpec.sequence.length} steps` : undefined,
  },
  {
    key: "changeapproval", title: "Exact change approved",
    reached: (c) => c.changeApproval?.status === "approved",
    detail: (c) => c.changeApproval?.approvedBy ? `By ${c.changeApproval.approvedBy}` : undefined,
  },
  {
    key: "execute", title: "Applied in JDE DEV",
    reached: (c) => ["EXECUTING", "TESTING", "VALIDATED", "CNC_HANDOFF", "CLOSED"].includes(c.state),
    detail: () => undefined,
  },
  {
    key: "test", title: "Tested",
    reached: (c) => c.testResult?.outcome === "pass" || c.testResult?.outcome === "fail",
    detail: (c) => c.testResult?.outcome === "pass" ? "Passed" : c.testResult?.outcome === "fail" ? "Failed" : undefined,
  },
  {
    key: "validate", title: "Human validation",
    reached: (c) => !!c.humanValidation,
    detail: (c) => c.humanValidation ? `By ${c.humanValidation.validatedBy}` : undefined,
  },
  {
    key: "cnc", title: "CNC hand-off",
    reached: (c) => ["CNC_HANDOFF", "CLOSED"].includes(c.state),
    detail: () => "Package build and promotion stays with CNC",
  },
  {
    key: "closure", title: "Closed with the requester",
    reached: (c) => !!c.closure,
    detail: (c) => c.closure ? `Requester: ${c.closure.requesterConfirmation}` : undefined,
  },
];

export function ChangeDetail({ changeId, onBack }: { changeId: string; onBack: () => void }) {
  const [change, setChange] = useState<Change | null>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);

  const reload = () => api.getChange(changeId).then((c) => setChange(c ?? null));
  useEffect(() => { reload(); }, [changeId]);
  useEffect(() => {
    api.getDomainReview(changeId).then((r) => setDomainReview(r ?? null));
    api.listBusinessDomains().then(setDomains);
  }, [changeId]);

  if (!change) return <Loading what="this change" />;

  const assignedDomain = domains.find((d) => d.id === domainReview?.businessDomainId);

  const reachedFlags = LIFECYCLE.map((s) => s.reached(change));
  const lastReached = reachedFlags.lastIndexOf(true);
  const items: TimelineItem[] = LIFECYCLE.map((s, i) => ({
    title: s.title,
    detail: s.detail(change),
    status: i < lastReached ? "done" : i === lastReached ? "current" : "pending",
  }));

  const ec = change.exactChange;
  const applied = ["EXECUTING", "TESTING", "VALIDATED", "CNC_HANDOFF", "CLOSED"].includes(change.state);

  return (
    <>
      <div className="pagehead">
        <div>
          <button className="linkish" onClick={onBack} style={{ marginBottom: 6 }}>← Back</button>
          <h1>{change.title}</h1>
          <div className="mono sub">
            {change.id} · {change.source} · {change.sourceReference || "no reference"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <PriorityBadge priority={change.priority} />
          <StateBadge state={change.state} />
        </div>
      </div>

      <div className="detailgrid">
        <div className="stack">
          <section className="panel">
            <h2>Original request</h2>
            <Provenance kind="plain" label="As submitted by the requester">
              <div style={{ fontSize: 13.5 }}>{change.originalRequest}</div>
            </Provenance>
          </section>

          {!IS_MOCK_MODE && <RequestDocuments requestId={change.id} />}

          {domainReview && (
            <section className="panel">
              <h2>Business domain</h2>
              <dl className="facts">
                <dt>Domain</dt>
                <dd>
                  {domainReview.domainClassificationUncertain ? (
                    <span className="badge warn">Classification uncertain — {domainReview.domainClassificationNote || "not yet placed"}</span>
                  ) : assignedDomain ? (
                    <>{assignedDomain.name} <span className="mono" style={{ color: "var(--muted)" }}>({assignedDomain.apqcCode})</span></>
                  ) : (
                    <NotStated />
                  )}
                </dd>
                <dt>Domain Owner</dt>
                <dd>{assignedDomain ? ownersOf(assignedDomain) : <NotStated />}</dd>
                <dt>Governance stage</dt>
                <dd>{DOMAIN_STAGE_LABEL[domainReview.stage] ?? domainReview.stage}</dd>
              </dl>
              {(domainReview.domainOwnerApproval || domainReview.applicationManagerApproval) && (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {domainReview.domainOwnerApproval && (
                    <Provenance kind="human" label={`Domain Owner approved by ${domainReview.domainOwnerApproval.approvedBy}`}>
                      <div style={{ fontSize: 13.5 }}>{domainReview.domainOwnerApproval.note || <span className="notstated">no reason recorded</span>}</div>
                    </Provenance>
                  )}
                  {domainReview.applicationManagerApproval && (
                    <Provenance kind="human" label={`Application Manager approved into the Delivery Queue by ${domainReview.applicationManagerApproval.approvedBy}`}>
                      <div style={{ fontSize: 13.5 }}>{domainReview.applicationManagerApproval.note || <span className="notstated">no reason recorded</span>}</div>
                    </Provenance>
                  )}
                </div>
              )}
              <div className="apinote">
                Domain Owner approval means the business requirement / User Story is
                approved. Application Manager approval means the work is authorised for
                Jade to deliver, admitted to the Delivery Queue — the two are always separate.
              </div>
            </section>
          )}

          {change.userStory && (
            <section className="panel">
              <h2>User story</h2>
              <Provenance kind="ai" label="Written by Jade — reviewed and approved by a person below">
                <p style={{ margin: "0 0 10px", fontSize: 14.5, fontWeight: 700 }}>{change.userStory.statement}</p>
                <p style={{ margin: 0, fontSize: 13.5 }}>{change.userStory.businessContext}</p>
              </Provenance>
              <DocumentCitations citations={change.userStory.documentCitations} />
              {change.userStory.acceptanceCriteria.length > 0 && (
                <table className="data" style={{ marginTop: 14 }}>
                  <thead><tr><th>#</th><th>Acceptance criterion</th><th>Verified by</th></tr></thead>
                  <tbody>
                    {change.userStory.acceptanceCriteria.map((ac) => (
                      <tr key={ac.id}><td className="mono">{ac.id}</td><td>{ac.text}</td><td className="mono">{ac.verifiedBy ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {change.storyApproval && (
            <section className="panel">
              <h2>Business approval</h2>
              <Provenance
                kind={change.storyApproval.status === "approved" ? "human" : "plain"}
                label={`${change.storyApproval.status === "approved" ? "Approved" : "Rejected"} by ${change.storyApproval.approvedBy} · ${new Date(change.storyApproval.approvedAt!).toLocaleString("en-GB")}`}
              >
                <div style={{ fontSize: 13.5 }}>
                  {change.storyApproval.note || <span className="notstated">no reason recorded</span>}
                </div>
              </Provenance>
            </section>
          )}

          {change.architectDecision && (
            <section className="panel">
              <h2>Architect decision</h2>
              <Provenance kind="ai" label={`Recommended route: ${change.architectDecision.recommendedRoute} · confidence ${Math.round(change.architectDecision.confidence * 100)}%`}>
                <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                  {change.architectDecision.existingFunctionalityFound}
                </p>
                {change.architectDecision.alternativesConsidered.length > 0 && (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Why not the simpler options</div>
                    <table className="data">
                      <thead><tr><th>Considered</th><th>Why it was not selected</th></tr></thead>
                      <tbody>
                        {change.architectDecision.alternativesConsidered.map((a, i) => (
                          <tr key={i}><td>{a.approach}</td><td>{a.whyNot}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Provenance>
              <dl className="facts" style={{ marginTop: 14 }}>
                <dt>Objects affected</dt>
                <dd>{change.architectDecision.objectsAffected.length
                  ? <span className="mono">{change.architectDecision.objectsAffected.join(", ")}</span>
                  : <NotStated />}</dd>
                <dt>Could break</dt>
                <dd>{change.architectDecision.dependenciesAndConflicts.length
                  ? change.architectDecision.dependenciesAndConflicts.join("; ")
                  : "Nothing identified"}</dd>
                <dt>Rollback</dt><dd>{change.architectDecision.rollbackStrategy}</dd>
              </dl>
              <ApiNote endpoint="GET /changes/{id}/architecture" />
            </section>
          )}

          {ec && (
            <section className="panel">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h2 style={{ margin: 0 }}>The exact change</h2>
                {ec.capabilityStatus && <CapabilityStatusBadge status={ec.capabilityStatus} />}
              </div>
              <Provenance
                kind={applied ? "executed" : "proposed"}
                label={applied
                  ? "Applied to JD Edwards DEV"
                  : "Proposed only — nothing has been written to JD Edwards"}
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
                  {ec.capabilityId && <><dt>Capability</dt><dd className="mono">{ec.capabilityId}</dd></>}
                </dl>
              </Provenance>

              {ec.capabilityId && ec.capabilityExecutable === false && (
                <div className="callout" style={{ marginTop: 14, borderColor: "var(--warn)" }}>
                  <strong>Approving this will not make it execute</strong>
                  The capability behind this operation is currently{" "}
                  <strong>{CAPABILITY_STATUS_LABEL[ec.capabilityStatus!]}</strong>, not Validated — the
                  Functional Agent refuses to execute it regardless of exact-change approval, until a
                  designated functional owner and technical validator promote it (or, for a Needs-spike
                  capability, this exact target is explicitly approved as a bounded DEV validation
                  experiment). Your decision below is still a real, recorded governance decision — it just
                  will not result in a write to JD Edwards yet.
                </div>
              )}

              {change.changeApproval ? (
                <div style={{ marginTop: 12 }}>
                  <Provenance
                    kind="human"
                    label={`Exact change ${change.changeApproval.status} by ${change.changeApproval.approvedBy} · ${new Date(change.changeApproval.approvedAt!).toLocaleString("en-GB")}`}
                  >
                    <div style={{ fontSize: 13.5 }}>
                      {change.changeApproval.note || <span className="notstated">no note recorded</span>}
                    </div>
                    {change.changeApproval.status === "approved" && (
                      <div className="mono" style={{ fontSize: 12, marginTop: 8, color: "var(--muted)" }}>
                        Bound to hash {change.changeApproval.changeHash} — if the operation differs at
                        execution by even one character, it is refused.
                      </div>
                    )}
                  </Provenance>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <div className="callout" style={{ marginBottom: 14 }}>
                    <strong>This still needs your decision</strong>
                    Approving the story was a decision about whether the work is worth doing.
                    This is a separate decision about whether this exact operation is the right one.
                  </div>
                  {decisionError && (
                    <div className="callout" style={{ borderColor: "var(--stop)", marginBottom: 14 }}>
                      <strong>Not recorded</strong>
                      {decisionError}
                    </div>
                  )}
                  <div className="btnrow">
                    <button className="btn primary" onClick={() => setDialog("approve")} disabled={busy}>
                      Approve this exact change
                    </button>
                    <button className="btn danger" onClick={() => setDialog("reject")} disabled={busy}>
                      Reject this exact change
                    </button>
                  </div>
                </div>
              )}
              <ExecutionPanel changeId={change.id} execution={ec.execution} approvalStatus={change.changeApproval?.status} onChanged={reload} />
            </section>
          )}

          {change.testSpecification && (
            <section className="panel">
              <h2>Test</h2>
              <dl className="facts">
                <dt>Mode</dt><dd>{change.testSpecification.mode}</dd>
                {change.testSpecification.orchestrationName && (
                  <><dt>Orchestration</dt><dd className="mono">{change.testSpecification.orchestrationName}</dd></>
                )}
              </dl>
              {change.testResult && change.testResult.outcome !== "not run" ? (
                <div style={{ marginTop: 12 }}>
                  <Provenance
                    kind="executed"
                    label={`Test ${change.testResult.outcome === "pass" ? "passed" : "failed"} · ${change.testResult.ranAt ? new Date(change.testResult.ranAt).toLocaleString("en-GB") : ""}`}
                  >
                    <div style={{ fontSize: 13.5 }}>{change.testResult.detail ?? "No further detail recorded."}</div>
                  </Provenance>
                </div>
              ) : (
                <div className="empty" style={{ padding: 20, marginTop: 12 }}>Not run yet.</div>
              )}
            </section>
          )}

          {change.humanValidation && (
            <section className="panel">
              <h2>Human validation</h2>
              <Provenance kind="human" label={`Validated by ${change.humanValidation.validatedBy} · ${new Date(change.humanValidation.validatedAt).toLocaleString("en-GB")}`}>
                <div style={{ fontSize: 13.5 }}>{change.humanValidation.note}</div>
              </Provenance>
            </section>
          )}

          {change.closure && (
            <section className="panel">
              <h2>Closure</h2>
              <dl className="facts">
                <dt>What changed</dt><dd>{change.closure.whatChanged}</dd>
                <dt>Told the requester</dt><dd>{change.closure.businessFacingResult}</dd>
                <dt>Limitations</dt><dd>{change.closure.limitations || <NotStated />}</dd>
                <dt>Source system</dt><dd>{change.closure.sourceUpdateStatus}</dd>
                <dt>Requester says</dt><dd><strong>{change.closure.requesterConfirmation}</strong></dd>
              </dl>
            </section>
          )}

          <section className="panel">
            <h2>Evidence <span className="qualifier">— append-only, hash-chained</span></h2>
            <table className="data">
              <thead><tr><th>#</th><th>Stage</th><th>What happened</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                {change.evidence.map((e) => (
                  <tr key={e.entryId}>
                    <td className="mono">{e.entryId}</td>
                    <td>{e.stage}</td>
                    <td>{e.detail}</td>
                    <td>{e.actor}</td>
                    <td className="mono">{new Date(e.capturedAt).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ApiNote endpoint="GET /changes/{id}/evidence" />
          </section>
        </div>

        <aside className="panel">
          <h2>Lifecycle</h2>
          <Timeline items={items} />
        </aside>
      </div>

      {dialog && ec && (
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
                <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
              </dl>
            </>
          }
          whatHappensNext={
            dialog === "approve"
              ? "The Functional Agent may apply exactly this operation in DEV, then run the named test. If anything about the operation differs from what you see here, it will be refused."
              : "This exact operation is refused. Nothing is written to JD Edwards."
          }
          confirmLabel={dialog === "approve" ? "Approve this exact change" : "Reject this exact change"}
          tone={dialog === "approve" ? "primary" : "danger"}
          requireNote={dialog === "reject"}
          showReasonCode={dialog === "reject"}
          onCancel={() => setDialog(null)}
          onConfirm={async (note, reasonCode) => {
            const wasApprove = dialog === "approve";
            setDialog(null); setBusy(true); setDecisionError(null);
            try {
              if (wasApprove) await api.approveExactChange(change.id, { note });
              else await api.rejectExactChange(change.id, { note, rejectionReason: reasonCode });
            } catch (e) {
              // e.g. no approval policy for this company, or a role it does not allow.
              setDecisionError(saveErrorMessage(e, "The decision could not be recorded."));
            } finally {
              await reload(); setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
