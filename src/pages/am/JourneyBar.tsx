import { Link } from "../../router";
import type { Navigate } from "../../types/nav";

/** Navigation through the Application Manager journey; canonical lifecycle remains on the story. */
export function JourneyBar({ storyId, at }: { storyId: string; at: string; onNavigate?: Navigate; frameworkId?: string }) {
  const s = encodeURIComponent(storyId);
  const stops: [string, string, string][] = [
    ["approved", "Approved User Story", `/stories/${s}/story`],
    ["backlog", "Backlog Review", `/am/backlog-review?story=${s}`],
    ["design", "Architecture Review", `/am/architecture-review?story=${s}`],
    ["implementation", "Delivery", `/am/technical?story=${s}`],
    ["validation", "Validation", `/am/changes?stage=validation&story=${s}`],
    ["asbuilt", "As-Built", `/am/as-built?story=${s}`],
    ["release", "Ready for Release / CNC", `/am/changes?stage=release&story=${s}`],
  ];
  return (
    <nav aria-label="Story journey" className="journeybar">
      {stops.map(([key, label, to], i) => (
        <span key={key} className="journeybar-stop">
          <Link to={to} className={`btn small${(at === key || (key === "design" && ["process", "maps"].includes(at))) ? " primary" : ""}`} aria-current={(at === key || (key === "design" && ["process", "maps"].includes(at))) ? "step" : undefined}>{label}</Link>
          {i < stops.length - 1 && <span aria-hidden="true" className="journeybar-arrow">→</span>}
        </span>
      ))}
    </nav>
  );
}
