import { useEffect, useState } from "react";
import { discoveryApi, type DesignBaselineView } from "../services/discoveryApi";
import { saveErrorMessage } from "../services/saveErrors";

const statusTone: Record<string, string> = { current: "ok", needs_reassessment: "stop", superseded: "grey" };
const basisTone: Record<string, string> = { observed: "ok", customer_attestation: "warn", process_reference: "ok", assumption: "grey" };

/**
 * The evidence baseline behind the Architect's design: which environment
 * was investigated, what was actually read or imported, the citations,
 * and what is missing, stale or conflicting. Refresh Evidence re-reads the
 * same targets and keeps every earlier baseline.
 */
export function DesignEvidencePanel({ changeId, designCount }: { changeId: string; designCount: number }) {
  const [baselines, setBaselines] = useState<DesignBaselineView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = () => {
    discoveryApi.designEvidence(changeId)
      .then((b) => { setBaselines(b); setError(null); })
      .catch((e) => setError(saveErrorMessage(e, "Could not load the design evidence.")));
  };
  useEffect(load, [changeId, designCount]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      await discoveryApi.refreshEvidence(changeId);
      load();
    } catch (e) {
      setError(saveErrorMessage(e, "Refresh refused."));
    } finally {
      setBusy(false);
    }
  }

  const current = baselines?.[0];
  const m = current?.manifest;
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Evidence behind this design</h2>
        {current && <button className="btn" disabled={busy} onClick={refresh}>{busy ? "Refreshing…" : "Refresh Evidence"}</button>}
      </div>
      {error && <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 8 }}>{error}</div>}
      {!baselines ? null : !current || !m ? (
        <p className="notstated">No evidence baseline recorded for this design yet.</p>
      ) : (
        <div className="stack" style={{ marginTop: 8 }}>
          <div>
            <span className={`badge ${statusTone[current.status] ?? "grey"}`}>{current.status.replace(/_/g, " ")}</span>{" "}
            <span className="hint">Design revision {current.designRevision}, baseline {current.baselineRevision} ({current.trigger}), {new Date(current.createdAt).toLocaleString("en-GB")} · sha256 {current.manifestSha256.slice(0, 12)}…</span>
            {current.reassessment.length > 0 && (
              <div className="callout" style={{ borderColor: "var(--stop)", marginTop: 6 }}>
                <strong>Reassess this design</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{current.reassessment.map((r, i) => <li key={i}>{r.kind.replace(/_/g, " ")}: {r.detail}</li>)}</ul>
              </div>
            )}
            <div className="hint" style={{ marginTop: 4 }}>{m.scope_statement}</div>
            {current.trigger === "refresh" && m.refresh_note && (
              <div className="callout" style={{ marginTop: 6 }}><strong>Refreshed evidence</strong>{m.refresh_note}</div>
            )}
          </div>

          <dl className="facts">
            <dt>Environment investigated</dt>
            <dd>{m.environment_profile
              ? <>{m.environment_profile.environment} · path code {m.environment_profile.path_code} · application {m.environment_profile.application_release}, Tools {m.environment_profile.tools_release} · profile revision {m.environment_profile.revision}{" "}
                <span className={`badge ${m.environment_profile.mode === "simulation" ? "warn" : "ok"}`}>{m.environment_profile.mode === "simulation" ? "SIMULATION" : "live"}</span></>
              : <span className="badge stop">not investigated</span>}</dd>
          </dl>

          <div>
            <strong>What was read</strong>
            {m.observations.length === 0 ? <p className="notstated">No live observations.</p> : (
              <table className="data">
                <thead><tr><th>Observation</th><th>Read</th><th>When</th><th>Result</th></tr></thead>
                <tbody>{m.observations.map((o) => (
                  <tr key={o.observation_id}>
                    <td className="mono">{o.observation_id}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{o.capability_id} {o.target}<div className="hint">{o.provenance}</div></td>
                    <td>{new Date(o.observed_at).toLocaleString("en-GB")}</td>
                    <td>
                      {o.record_count} record(s){!o.values_shared && <div className="hint">values redacted for the model</div>}
                      <div className="hint mono" title="Computed over the full read result; a change detector, not retained content">change detector {o.payload_sha256.slice(0, 10)}…</div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {(m.artifacts.length > 0 || m.documents.length > 0) && (
              <table className="data">
                <thead><tr><th>Imported evidence</th><th>Provenance</th><th>Applies?</th></tr></thead>
                <tbody>{[...m.artifacts, ...m.documents].map((a) => (
                  <tr key={String(a.evidence_id)}>
                    <td className="mono">{String(a.evidence_id)}<div className="hint">{String(a.object_type ?? "")} {String(a.title ?? a.object_name ?? "")}</div>
                      {(() => {
                        const c = a.analysis_coverage as { analysed_chars?: number; total_chars?: number; truncated?: boolean } | undefined;
                        return c?.truncated
                          ? <div><span className="badge warn">truncated</span> <span className="hint">{(c.analysed_chars ?? 0).toLocaleString("en-GB")} of {(c.total_chars ?? 0).toLocaleString("en-GB")} characters analysed</span></div>
                          : c?.total_chars ? <div className="hint">all {c.total_chars.toLocaleString("en-GB")} characters analysable</div> : null;
                      })()}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{String(a.repository || a.source_location || "")} {String(a.commit_ref || "")}<div className="hint mono">sha256 {String(a.sha256).slice(0, 12)}…</div></td>
                    <td>{String(a.kind) === "reference_document"
                      ? <span className={`badge ${a.compatibility === "compatible" ? "ok" : "stop"}`}>{String(a.compatibility)}</span>
                      : <span className={`badge ${a.runtime_correspondence === "matches_dev_runtime" ? "ok" : "warn"}`}>{String(a.runtime_correspondence).replace(/_/g, " ")}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {m.citations.length > 0 && (
            <div>
              <strong>Citations supporting the design</strong>
              <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                {m.citations.map((c, i) => (
                  <li key={i}>
                    <span className={`badge ${basisTone[c.basis] ?? "grey"}`}>{c.basis.replace(/_/g, " ")}</span>{" "}
                    {c.claim} <span className="mono hint">{c.evidence_ids.join(", ")}</span>
                    {!c.validated && <div className="hint">Not verified: {c.note} (claimed {c.claimed_basis})</div>}
                    {c.limitations?.map((l) => <div key={l} className="hint">{l}</div>)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(m.gaps.length > 0 || m.contradictions.length > 0 || m.confidence_limitations.length > 0) && (
            <div>
              <strong>Missing, stale or conflicting information</strong>
              <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                {m.gaps.map((g, i) => (
                  <li key={`g${i}`}><span className="badge warn">{g.kind}</span> {g.description}
                    {g.question && <div className="hint">Question: {g.question}</div>}
                    {g.blocked_step && <div className="hint">Blocked step: {g.blocked_step}</div>}
                  </li>
                ))}
                {m.contradictions.map((c, i) => <li key={`c${i}`}><span className="badge stop">conflict</span> {c}</li>)}
                {m.confidence_limitations.map((c, i) => <li key={`l${i}`}><span className="badge grey">limitation</span> {c}</li>)}
              </ul>
            </div>
          )}
          {(m.dependencies.length > 0 || m.customisations.length > 0) && (
            <dl className="facts">
              <dt>Dependencies</dt><dd>{m.dependencies.join("; ") || "—"}</dd>
              <dt>Customisations</dt><dd>{m.customisations.join("; ") || "—"}</dd>
            </dl>
          )}

          {baselines.length > 1 && (
            <div>
              <button className="btn" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide" : "Show"} earlier baselines ({baselines.length - 1})</button>
              {showHistory && (
                <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                  {baselines.slice(1).map((b) => (
                    <li key={b.baselineId}>Baseline {b.baselineRevision} ({b.trigger}, design {b.designRevision}) {new Date(b.createdAt).toLocaleString("en-GB")} — <span className="badge grey">{b.status}</span> {b.manifest.observations.length} observation(s)</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {m.evidence_notes?.map((n) => <p key={n} className="hint">{n}</p>)}
          <p className="hint">This baseline does not authorise any change. Execution re-checks approval, scope and the live environment on its own.</p>
        </div>
      )}
    </section>
  );
}
