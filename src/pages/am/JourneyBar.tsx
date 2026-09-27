import { Link } from "../../router";
import type { Navigate } from "../../types/nav";

/**
 * The Application Manager's journey for one story (restored from main):
 * which workbench to open next, from the process hierarchy through design
 * and implementation to the as-built record. The lifecycle stepper on the
 * story shows *where* the story is; this bar is how the Application
 * Manager moves between the workbenches for it.
 */
export function JourneyBar({ storyId, at }: { storyId: string; at: string; onNavigate?: Navigate; frameworkId?: string }) {
  const s = encodeURIComponent(storyId);
  const stops: [string, string, string][] = [
    ["hierarchy", "Process hierarchy", "/business"],
    ["process", "Story & processes", `/am/process?story=${s}`],
    ["maps", "Process maps", `/am/process?story=${s}#process-maps`],
    ["design", "Design", `/am/architecture-review?story=${s}`],
    ["implementation", "Implementation", `/am/technical?story=${s}`],
    ["asbuilt", "As-built record", `/am/as-built?story=${s}`],
  ];
  return (
    <nav aria-label="Story journey" className="journeybar">
      {stops.map(([key, label, to], i) => (
        <span key={key} className="journeybar-stop">
          <Link to={to} className={`btn small${at === key ? " primary" : ""}`} aria-current={at === key ? "step" : undefined}>{label}</Link>
          {i < stops.length - 1 && <span aria-hidden="true" className="journeybar-arrow">→</span>}
        </span>
      ))}
    </nav>
  );
}
