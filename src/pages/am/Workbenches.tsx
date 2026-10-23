import { KnowledgePage } from "../knowledge/Knowledge";
import { Link } from "../../router";

/** As-built: the finalised records as knowledge, and the stories whose record is waiting to be
 * finalised. Each record opens on its own change record (Delivery, release). */
export function AsBuiltWorkbench() {
  return (
    <div className="stack vr-pilot">
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>As-Built</h1>
        <p className="hint explain">What was actually delivered, finalised only when every required checkpoint is complete. A story's record opens on its change record.</p>
        <Link className="btn" to="/am/changes?stage=asbuilt">Stories waiting for their as-built record</Link>
      </section>
      <KnowledgePage part="solutions" />
    </div>
  );
}
