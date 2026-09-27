import type { ReactNode } from "react";
import type { RatingView } from "../types/domain";

export function CompactRating({rating}: {rating?: RatingView}) {
  const value = rating?.confirmed ?? rating?.proposed;
  return <span className={`vr-compact-rating ${rating?.status ?? "not_assessed"}`}><strong>{value ?? "Not assessed"}</strong>{value && <small>{rating?.status === "confirmed" ? "Confirmed" : rating?.status === "stale" ? "Review again" : "Proposed"}</small>}</span>;
}

export function VisualFacts({items}: {items: {label:string; value:ReactNode; tone?:string}[]}) {
  return <dl className="vr-facts-strip">{items.map((item) => <div key={item.label} className={item.tone ?? ""}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function ValidationSummary({passed, failed, pending}: {passed:number; failed:number; pending:number}) {
  const total = passed + failed + pending;
  return <div className="vr-validation-summary" aria-label="Validation results"><VisualFacts items={[{label:"Passed",value:passed,tone:"ok"},{label:"Failed",value:failed,tone:failed ? "stop" : ""},{label:"Not run",value:pending}]} />
    {total > 0 && <div className="vr-result-bar" role="img" aria-label={`${passed} passed, ${failed} failed, ${pending} not run`}><span className="ok" style={{width:`${passed/total*100}%`}} /><span className="stop" style={{width:`${failed/total*100}%`}} /><span style={{width:`${pending/total*100}%`}} /></div>}
  </div>;
}

export function EvidenceChain({items}: {items:{label:string; detail:string; to?:string}[]}) {
  return <ol className="vr-evidence-chain" aria-label="Requirement to delivery evidence">{items.map((item,i) => <li key={item.label}><span className="vr-stepno">{i+1}</span><div><strong>{item.label}</strong><span className="vr-note">{item.detail}</span>{item.to && <a href={item.to}>View evidence →</a>}</div></li>)}</ol>;
}
