import { useState } from "react";
import { api } from "../services/api";
import { saveErrorMessage } from "../services/saveErrors";
import { CHANGE_TYPES, PRIORITIES, type Change, type ChangeType, type Priority } from "../types/domain";
import { Fact, useSessionInfo } from "./design";

/**
 * A story's priority and change type, set by people (never by JADE). Each
 * choice saves at once against the revision that was loaded; a viewer sees
 * the values only.
 */
export function ClassificationFacts({ change, onSaved }: { change: Change; onSaved: () => void }) {
  const info = useSessionInfo();
  const canEdit = info.roles.some((r) => r !== "dashboard_viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = !!change.classificationRevision;

  async function save(input: { priority?: Priority; changeType?: ChangeType }) {
    setBusy(true); setError("");
    try {
      await api.setClassification(change.id, { ...input, expectedRevision: change.classificationRevision ?? 0 });
      onSaved();
    } catch (e) {
      setError(saveErrorMessage(e, "The classification was not saved."));
    } finally {
      setBusy(false);
    }
  }

  const who = set && change.classifiedBy ? `Set by ${change.classifiedBy}` : "Not set yet";
  return (
    <>
      <Fact label="Priority">
        {canEdit ? (
          <select aria-label="Priority" value={change.priority} disabled={busy}
                  onChange={(e) => save({ priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        ) : change.priority}
      </Fact>
      <Fact label="Change type">
        {canEdit ? (
          <select aria-label="Change type" value={change.changeType} disabled={busy}
                  onChange={(e) => save({ changeType: e.target.value as ChangeType })}>
            {CHANGE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        ) : change.changeType}
        <div className="hint">{who}</div>
        {error && <div className="fielderror" role="alert">{error}</div>}
      </Fact>
    </>
  );
}
