import type { MapContent, MapStep } from "../services/processApi";

/**
 * A diagram generated from a structured process map: steps are layered by
 * their longest path from a start step, top to bottom. Assumptions are
 * drawn dashed in amber; confirmed customer practice solid in green.
 */
const W = 190, H = 58, GX = 36, GY = 54, PAD = 20;

function layers(content: MapContent): Map<string, number> {
  const ids = content.steps.map((s) => s.id);
  const incoming = new Map(ids.map((id) => [id, 0]));
  content.connections.forEach((c) => incoming.set(c.to, (incoming.get(c.to) ?? 0) + 1));
  const layer = new Map<string, number>();
  const roots = content.steps.filter((s) => s.type === "start" || !incoming.get(s.id)).map((s) => s.id);
  (roots.length ? roots : ids.slice(0, 1)).forEach((r) => layer.set(r, 0));
  // Longest path, bounded so a cycle cannot loop forever.
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const c of content.connections) {
      const from = layer.get(c.from);
      if (from === undefined) continue;
      if ((layer.get(c.to) ?? -1) < from + 1 && from + 1 < ids.length) { layer.set(c.to, from + 1); moved = true; }
    }
    if (!moved) break;
  }
  ids.forEach((id) => { if (!layer.has(id)) layer.set(id, 0); });
  return layer;
}

function Shape({ s, x, y }: { s: MapStep; x: number; y: number }) {
  const confirmed = s.basis === "confirmed";
  const stroke = confirmed ? "var(--ok, #2e7d32)" : "var(--warn, #b26a00)";
  const dash = confirmed ? undefined : "5 4";
  const fill = "var(--panel, #fff)";
  const cx = x + W / 2, cy = y + H / 2;
  const shape = s.type === "decision"
    ? <polygon points={`${cx},${y} ${x + W},${cy} ${cx},${y + H} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={1.6} strokeDasharray={dash} />
    : <rect x={x} y={y} width={W} height={H} rx={s.type === "task" ? 6 : H / 2} fill={fill} stroke={stroke} strokeWidth={1.6} strokeDasharray={dash} />;
  const label = s.label.length > 30 ? s.label.slice(0, 29) + "…" : s.label;
  const sub = [s.actor, s.system].filter(Boolean).join(" · ");
  return (
    <g>
      <title>{`${s.id} ${s.label}\n${s.basis === "confirmed" ? "Confirmed: " + s.confirmation_source : "ASSUMPTION (not confirmed)"}${s.node_ref ? "\nProcess " + s.node_ref.node_key : ""}${s.controls.length ? "\nControls: " + s.controls.join("; ") : ""}`}</title>
      {shape}
      <text x={cx} y={cy - (sub ? 4 : -4)} textAnchor="middle" fontSize={12} fill="currentColor">{label}</text>
      {sub && <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10.5} fill="var(--muted, #666)">{sub.length > 34 ? sub.slice(0, 33) + "…" : sub}</text>}
      <text x={x + 4} y={y + 11} fontSize={9.5} fill="var(--muted, #666)">{s.id}{s.node_ref ? ` · ${s.node_ref.node_key}` : ""}</text>
      {s.controls.length > 0 && <text x={x + W - 4} y={y + 11} textAnchor="end" fontSize={9.5} fill={stroke}>◆ {s.controls.length} control{s.controls.length > 1 ? "s" : ""}</text>}
    </g>
  );
}

export function ProcessMapDiagram({ content }: { content: MapContent }) {
  if (!content.steps.length) return <p className="notstated">No steps yet.</p>;
  const layer = layers(content);
  const rows = new Map<number, MapStep[]>();
  content.steps.forEach((s) => { const l = layer.get(s.id)!; rows.set(l, [...(rows.get(l) ?? []), s]); });
  const maxCols = Math.max(...[...rows.values()].map((r) => r.length));
  const width = PAD * 2 + maxCols * W + (maxCols - 1) * GX;
  const pos = new Map<string, { x: number; y: number }>();
  [...rows.entries()].forEach(([l, row]) => {
    const rowWidth = row.length * W + (row.length - 1) * GX;
    row.forEach((s, i) => pos.set(s.id, { x: (width - rowWidth) / 2 + i * (W + GX), y: PAD + l * (H + GY) }));
  });
  const height = PAD * 2 + (Math.max(...layer.values()) + 1) * (H + GY) - GY;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg role="img" aria-label={`Process map diagram: ${content.title}`} width={width} height={height}
           viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: "100%", height: "auto", color: "var(--ink, #222)" }}>
        <defs>
          <marker id="pm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--muted, #666)" />
          </marker>
        </defs>
        {content.connections.map((c, i) => {
          const a = pos.get(c.from), b = pos.get(c.to);
          if (!a || !b) return null;
          const back = b.y <= a.y;
          const x1 = a.x + W / 2, y1 = back ? a.y + H / 2 : a.y + H, x2 = b.x + W / 2, y2 = back ? b.y + H / 2 : b.y;
          const d = back ? `M${a.x + W},${y1} C${a.x + W + 60},${y1} ${b.x + W + 60},${y2} ${b.x + W},${y2}`
            : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="var(--muted, #666)" strokeWidth={1.3} markerEnd="url(#pm-arrow)" />
              {c.label && <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2} fontSize={10.5} fill="var(--muted, #666)">{c.label}</text>}
            </g>
          );
        })}
        {content.steps.map((s) => <Shape key={s.id} s={s} {...pos.get(s.id)!} />)}
      </svg>
      <div className="hint" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ borderBottom: "2px solid var(--ok, #2e7d32)" }}>solid green</span> = confirmed customer practice</span>
        <span><span style={{ borderBottom: "2px dashed var(--warn, #b26a00)" }}>dashed amber</span> = assumption (proposed, not confirmed)</span>
        <span>◇ decision · ▢ task · ⬭ start/end</span>
      </div>
    </div>
  );
}
