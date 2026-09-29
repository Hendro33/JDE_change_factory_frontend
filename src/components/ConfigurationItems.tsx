import type { ConfigurationItem, ExactChange } from "../types/domain";

/** A configuration change set (several items) rather than a single processing option. */
export function isChangeSet(ec?: ExactChange | null): boolean {
  return !!ec && (ec.tool === "configuration_change_set" || (ec.items?.length ?? 0) > 1);
}

const KIND_LABEL: Record<string, string> = {
  processing_option: "Processing option",
  udc_value: "UDC value",
  setup_row: "Set-up table row",
  version_data_selection: "Batch version data selection",
  version_data_sequencing: "Batch version data sequencing",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** A value read from JD Edwards, in a line people can read. */
export function showValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { exists?: boolean; values?: Record<string, unknown>; specification?: string };
    if (o.specification) return o.specification;
    if (o.values !== undefined) {
      const vals = Object.entries(o.values ?? {});
      if (!o.exists && vals.length === 0) return "does not exist yet";
      return vals.map(([k, x]) => `${k} = ${String(x)}`).join(", ") || "exists";
    }
  }
  return JSON.stringify(v);
}

/** What the item sets, field by field. */
export function approvedLine(it: ConfigurationItem): string {
  if (it.kind === "processing_option") return `${it.option} = ${it.value}`;
  if (it.specification) return it.specification;
  return Object.entries(it.values).map(([k, v]) => `${k} = ${v}`).join(", ");
}

/**
 * Every item of an exact change, in the order a person applies them in DEV:
 * what it changes, why, what JD Edwards held when the change was approved,
 * and whether it is recorded as applied (read back live, or stated).
 */
export function ConfigurationItemsTable({ items, showDelivery = true }: { items: ConfigurationItem[]; showDelivery?: boolean }) {
  return (
    <div className="tablewrap" style={{ marginTop: 8 }}>
      <table className="data" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>#</th><th>Change</th><th>Sets</th><th>Before (read at approval)</th>
            {showDelivery && <th>In DEV</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="mono">{it.id}</td>
              <td>
                <div><span className="badge grey">{kindLabel(it.kind)}</span>{it.action && <> <span className="badge">{it.action}</span></>}</div>
                <div className="mono" style={{ marginTop: 4 }}>{it.label}</div>
                {it.purpose && <div className="hint">{it.purpose}</div>}
              </td>
              <td className="mono"><strong>{approvedLine(it)}</strong></td>
              <td>
                {it.beforeKnown ? <span className="mono">{showValue(it.before)}</span> : <span className="notstated">not known</span>}
                {it.beforeNote && <div className="hint">{it.beforeNote}</div>}
              </td>
              {showDelivery && (
                <td>
                  {it.applied ? (
                    <>
                      <span className={`badge ${it.applied.live || (it.applied.source ?? "").toLowerCase().startsWith("live") ? "ok" : "warn"}`}>
                        {it.applied.live || (it.applied.source ?? "").toLowerCase().startsWith("live") ? "Read back live" : "Stated by a person"}
                      </span>
                      <div className="hint">{it.applied.by}{it.applied.evidence_reference ? ` · ${it.applied.evidence_reference}` : ""}</div>
                    </>
                  ) : <span className="badge grey">Not recorded</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The exact change as people review it: a configuration change set with all
 * its items, or a single processing option.
 */
export function ExactChangeFacts({ ec, testLabel = "Tested by", showDelivery = true }: {
  ec: ExactChange; testLabel?: string; showDelivery?: boolean;
}) {
  if (isChangeSet(ec)) {
    return (
      <>
        <dl className="facts">
          <dt>Change</dt><dd>Configuration change set of {ec.items?.length ?? 0} items{ec.summary ? `: ${ec.summary}` : ""}</dd>
          <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
          <dt>{testLabel}</dt><dd className="mono">{ec.testOrchestration || "a recorded test result"}</dd>
        </dl>
        <ConfigurationItemsTable items={ec.items ?? []} showDelivery={showDelivery} />
      </>
    );
  }
  return (
    <dl className="facts">
      <dt>Change</dt><dd>Processing option</dd>
      <dt>Application</dt><dd className="mono">{ec.application}</dd>
      <dt>Version</dt><dd className="mono">{ec.version}</dd>
      <dt>Processing option</dt><dd className="mono">{ec.option}</dd>
      <dt>Current value</dt><dd><span className="mono">{ec.currentValue || "—"}</span>{ec.currentValueNote && <span className="hint"> ({ec.currentValueNote})</span>}</dd>
      <dt>Proposed value</dt><dd className="mono"><strong>{ec.proposedValue}</strong></dd>
      <dt>Environment</dt><dd className="mono">{ec.environment}</dd>
      <dt>{testLabel}</dt><dd className="mono">{ec.testOrchestration || "a recorded test result"}</dd>
    </dl>
  );
}
