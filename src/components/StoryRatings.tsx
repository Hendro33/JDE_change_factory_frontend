import { useEffect, useRef, useState } from "react";
import type { Change, RatingView, StoryRatings as Ratings } from "../types/domain";
import { api } from "../services/api";
import { request } from "../services/httpApi";
import { ReviewDetail } from "./visualReview";

export function RatingBadge({ label, rating }: {label: string; rating?: RatingView}) {
  const value = rating?.confirmed ?? rating?.proposed;
  return <div className="vr-rating"><span className="vr-label">{label}</span><strong>{value ?? "Not assessed"}</strong>
    <span className={`vr-rating-state ${rating?.status ?? "not_assessed"}`}>{rating?.status === "confirmed" ? "Human confirmed" : rating?.status === "stale" ? "Review again · source changed" : value ? "JADE proposal" : "No proposal yet"}</span></div>;
}

export function ImpactBenefitMap({ ratings, technical = false }: {ratings?: Ratings | null; technical?: boolean}) {
  const impact = technical ? ratings?.technicalImpact : ratings?.businessImpact;
  const benefit = ratings?.businessBenefit;
  const x = impact?.confirmed ?? impact?.proposed;
  const y = benefit?.confirmed ?? benefit?.proposed;
  const confirmed = impact?.status === "confirmed" && benefit?.status === "confirmed";
  return <div className="vr-matrix-wrap"><span className="vr-label">Business benefit ↑</span><div className="vr-matrix">{["High","Medium","Small"].map((row) => <div className="vr-matrix-row" key={row}><span className="vr-matrix-label">{row}</span>{["Low","Medium","High"].map((col) => <div className="vr-matrix-cell" key={col}>{x === col && y === row && <span className={`vr-matrix-point${confirmed ? " confirmed" : ""}`} aria-label={`${col} ${technical ? "technical" : "business"} impact; ${row} business benefit; ${confirmed ? "confirmed" : "includes proposals"}`}>{confirmed ? "●" : "○"}</span>}</div>)}</div>)}
    <div className="vr-matrix-row"><span />{["Low","Medium","High"].map((col) => <span className="vr-matrix-label" key={col}>{col}</span>)}</div></div>
    <span className="vr-label">{technical ? "Technical" : "Business"} impact →</span><span className="vr-note">{!x || !y ? "Both ratings are needed to position this story." : confirmed ? "● Human-confirmed ratings" : "○ Includes an unconfirmed JADE proposal"} </span></div>;
}

export function StoryRatingsPanel({ change, mode = "read", onChanged }: {change: Change; mode?: "business" | "technical" | "read"; onChanged?: () => void}) {
  const [ratings, setRatings] = useState<Ratings | null>(change.ratings ?? null);
  const [values, setValues] = useState<Record<string,string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const load = async () => {
    const version = ++loadVersion.current;
    try {
      const customerId = (await api.getSession()).activeCustomerId;
      const r = await request<Ratings>(`/changes/${encodeURIComponent(change.id)}/ratings`, {customerId});
      if (version !== loadVersion.current) return;
      setRatings(r);setError("");
    } catch (e) {if (version === loadVersion.current) setError(e instanceof Error ? e.message : "Ratings could not be loaded.");}
  };
  useEffect(() => {setRatings(change.ratings ?? null);setValues({});void load();return () => {loadVersion.current++;};}, [change.id]);
  const fields = mode === "business" ? ["businessImpact", "businessBenefit"] as const : mode === "technical" ? ["businessImpact", "businessBenefit", "technicalImpact"] as const : ["businessImpact", "businessBenefit", "technicalImpact"] as const;
  const labels = {businessImpact: "Business impact", businessBenefit: "Business benefit", technicalImpact: "Technical impact"};
  async function confirm(key: typeof fields[number]) {
    if (!ratings) return;
    const rating = ratings[key]; const value = values[key] ?? rating.confirmed ?? rating.proposed;
    if (!value) return;
    setBusy(true);setError("");
    try {
      const customerId = (await api.getSession()).activeCustomerId;
      const r = await request<Ratings>(`/changes/${encodeURIComponent(change.id)}/ratings/confirm`, {method: "POST", customerId,
        body: {key: {businessImpact:"business_impact",businessBenefit:"business_benefit",technicalImpact:"technical_impact"}[key],value,sourceHash:rating.sourceHash,expectedRevision:ratings.revision}});
      setRatings(r);setValues({});onChanged?.();
    } catch(e) {setError(e instanceof Error ? e.message : "Rating could not be confirmed.");} finally {setBusy(false);}
  }
  return <section className="panel vr-ratings-panel" aria-label="Impact and benefit assessment"><div className="vr-section-meta"><h2>Impact & benefit</h2><span>JADE proposes · people confirm</span></div>
    <div className="vr-ratings-layout vr-ratings-quiet"><div className="vr-ratings-list">{fields.map((key) => {
      const r = ratings?.[key];
      const editable = key === "technicalImpact" ? mode === "technical" && ratings?.canConfirmTechnical : mode === "business" && ratings?.canConfirmBusiness;
      return <div key={key}><RatingBadge label={labels[key]} rating={r} />{editable && r && <div className="vr-rating-controls"><label className="sr-only" htmlFor={`rating-${key}`}>{labels[key]}</label>
        <select id={`rating-${key}`} value={values[key] ?? r.confirmed ?? r.proposed ?? ""} onChange={(e) => setValues({...values,[key]:e.target.value})} disabled={busy}>
          <option value="">Not assessed</option>{[key === "businessBenefit" ? "Small" : "Low","Medium","High"].map((v) => <option key={v}>{v}</option>)}</select>
        <button className="btn small" aria-label={`Confirm ${labels[key].toLowerCase()}`} disabled={busy || !(values[key] ?? r.confirmed ?? r.proposed)} onClick={() => confirm(key)}>{r.status === "confirmed" ? "Update" : "Confirm"}</button></div>}
        {r?.confirmedBy && <span className="vr-note">Confirmed by {r.confirmedBy}</span>}</div>;
    })}</div><ReviewDetail title="Impact–benefit view"><ImpactBenefitMap ratings={ratings} technical={mode !== "business"} /></ReviewDetail></div>
    {error && <div className="callout" role="alert">{error} <button className="linkish" onClick={load}>Reload ratings</button></div>}
    <ReviewDetail title="Rating definitions & original impact notes"><p>Business impact: Low = local and limited; Medium = several related activities; High = cross-domain or business-critical. Technical impact: Low = isolated configuration; Medium = several objects or integrations; High = broad dependencies or critical interfaces. Business benefit: Small = modest local improvement; Medium = meaningful team/process improvement; High = substantial cross-domain or strategic value.</p>
      <p>These are planning assessments, not approvals. Unrated stories remain unassessed until JADE proposes a rating during story refinement or architecture analysis, or an authorised reviewer assigns one.</p>
      <dl className="facts">{Object.entries(change.businessImpact).map(([k,v]) => <div key={k}><dt>{k.replace(/([A-Z])/g," $1")}</dt><dd>{v || "Not stated"}</dd></div>)}</dl>
    </ReviewDetail>
  </section>;
}
