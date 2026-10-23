import { useEffect, useState } from "react";
import { automationApi, type AutomationSettings } from "../services/automationApi";
import { saveErrorMessage } from "../services/saveErrors";
import { Loading, formatDateTime } from "./design";
import { Link, storyPath } from "../router";

const ACTION_WORDS: Record<string, string> = {
  started: "Started", skipped: "Not started", capped: "Stopped retrying", changed: "Changed", unchanged: "Unchanged",
  unreadable: "Could not check", imported: "Picked up", failed: "Failed",
};
const KIND_WORDS: Record<string, string> = {
  intake: "User story", solutioning: "Solution", recheck: "Re-check before delivery", jira: "Jira", settings: "Settings",
};

/**
 * Routine automation (redesign step 4): one switch per customer, and the log of
 * what JADE started by itself. Every manual button stays as the fallback.
 */
export function RoutineAutomation() {
  const [view, setView] = useState<AutomationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    automationApi.get().then(setView).catch((e) => setError(saveErrorMessage(e, "Could not load routine automation.")));
  }, []);

  async function save(input: { enabled?: boolean; jiraPickup?: boolean }) {
    setBusy(true); setError(null);
    try { setView(await automationApi.save(input)); }
    catch (e) { setError(saveErrorMessage(e, "The setting was not changed.")); }
    finally { setBusy(false); }
  }

  if (!view) return error ? <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>{error}</div> : <Loading what="routine automation" />;
  return (
    <>
      <section className="panel" aria-label="Routine automation">
        <h2 style={{ marginTop: 0 }}>Routine automation</h2>
        <div className="sub" style={{ margin: "6px 0 12px" }}>
          Routine agent work starts by itself: new requests become user stories, the solution is reassessed when answers
          or setup changes come in, and approved changes are re-checked against JD Edwards before delivery. People are
          told about decisions, finished work and problems under the bell. At most {view.maxRunsPerDay} automatic runs
          of one kind per story per day; after that a person takes over.
        </div>
        {!view.serverEnabled && <div className="callout"><strong>Switched off on this server</strong>Routine automation is off for the whole server (JDE_ROUTINE_AUTOMATION). The setting below takes effect once it is on.</div>}
        {error && <div className="callout" role="alert" style={{ borderColor: "var(--stop)", marginBottom: 12 }}>{error}</div>}
        <table className="data">
          <thead><tr><th>Setting</th><th>State</th><th /></tr></thead>
          <tbody>
            <tr>
              <td><strong>Routine automation for this customer</strong><div className="muted">Intake, reassessment, re-check before delivery (every {view.recheckHours} hours at most).</div></td>
              <td><span className={`badge ${view.enabled ? "ok" : "stop"}`}>{view.enabled ? "On" : "Off"}</span></td>
              <td><button className="btn small" disabled={busy} onClick={() => save({ enabled: !view.enabled })}>{view.enabled ? "Switch off" : "Switch on"}</button></td>
            </tr>
            <tr>
              <td><strong>Pick up new Jira tickets</strong><div className="muted">Every {view.jiraPickupMinutes} minutes, when Jira is set up{view.lastJiraPickupAt ? `; last at ${formatDateTime(view.lastJiraPickupAt)}` : ""}.</div></td>
              <td><span className={`badge ${view.jiraPickup && view.enabled ? "ok" : "stop"}`}>{view.jiraPickup && view.enabled ? "On" : "Off"}</span></td>
              <td><button className="btn small" disabled={busy || !view.enabled} onClick={() => save({ jiraPickup: !view.jiraPickup })}>{view.jiraPickup ? "Switch off" : "Switch on"}</button></td>
            </tr>
          </tbody>
        </table>
        {view.updatedBy && <p className="muted">Last changed by {view.updatedBy}{view.updatedAt ? ` on ${formatDateTime(view.updatedAt)}` : ""}.</p>}
      </section>
      <section className="panel" aria-label="What JADE started by itself" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>What JADE did by itself</h2>
        {view.events.length === 0 ? <p className="muted">Nothing yet.</p> : (
          <table className="data">
            <thead><tr><th>When</th><th>Story</th><th>What</th><th>Detail</th></tr></thead>
            <tbody>{view.events.slice(0, 60).map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td className="nowrap">{formatDateTime(e.at)}</td>
                <td>{e.storyId ? <Link to={storyPath(e.storyId)}>{e.storyId}</Link> : <span className="muted">—</span>}</td>
                <td>{KIND_WORDS[e.kind] ?? e.kind}: {ACTION_WORDS[e.action] ?? e.action}</td>
                <td>{e.detail}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
