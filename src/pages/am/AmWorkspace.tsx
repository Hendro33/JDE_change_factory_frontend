import { useEffect } from "react";
import { ValidationWorkspace } from "../validation/Validation";
import { Link, match, navigate, useLocation } from "../../router";
import { EmptyState, useSessionInfo } from "../../components/design";
import { Dashboard } from "./Dashboard";
import { ApprovalBacklog } from "./ApprovalBacklog";
import { ArchitectureReview } from "./ArchitectureReview";
import { Pipeline } from "./Pipeline";
import { ChangeView } from "./ChangeView";
import { AsBuiltWorkbench, ProcessWorkbench, TechnicalWorkbench } from "./Workbenches";
import { legacyNavigate, openChange, useNavTarget } from "./legacyNav";
import { NotFoundPage } from "../NotFound";

/** Role-gated workspace. Legacy URLs remain usable inside their new parent sections. */
const GROUPS: { label: string; items: { to: string; label: string; stage?: string }[] }[] = [
  { label: "Governance", items: [
    { to: "/am/backlog-review", label: "Backlog Review" },
    { to: "/am/architecture-review", label: "Architecture Review" },
  ] },
  { label: "Delivery", items: [
    { to: "/am/delivery", label: "Delivery" },
    { to: "/am/validation", label: "Validation & release" },
    { to: "/am/as-built", label: "As-Built" },
  ] },
];

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    // Deferred: on a first page load the router subscribes to navigation after this effect runs.
    const t = setTimeout(() => navigate(to, { replace: true }), 0);
    return () => clearTimeout(t);
  }, [to]);
  return null;
}

export function AmWorkspace() {
  const info = useSessionInfo();
  const { path, query } = useLocation();
  const target = useNavTarget();

  if (!info.appManagement) {
    return (
      <EmptyState title="Application Management is for Application Managers">
        Approved stories are taken through architecture, delivery and release by the Application Manager.
        You can follow any story from <Link to="/stories">Business Demand</Link>.
      </EmptyState>
    );
  }

  let m: Record<string, string> | null;
  let page: JSX.Element;
  if (path === "/am") page = <Dashboard onOpenChange={openChange} onNavigate={legacyNavigate} />;
  else if (match("/am/validation", path)) page = <ValidationWorkspace releaseOnly />;
  else if (match("/am/backlog-review", path)) page = <ApprovalBacklog {...target} />;
  else if ((path === "/am/process" || (path === "/am/architecture-review" && query.get("view") === "design")) && query.get("story")) {
    // The old Process & Maps and Technical design tabs: the process and the design decision now sit
    // beside the solution in the change's application view.
    page = <Redirect to={`/am/changes/${encodeURIComponent(query.get("story")!)}#${path === "/am/process" ? "process" : "decision"}`} />;
  }
  else if (path === "/am/process") page = <ProcessWorkbench />;
  else if (match("/am/architecture-review", path) && query.get("view") === "design") page = <TechnicalWorkbench design />;
  else if (match("/am/architecture-review", path)) page = <ArchitectureReview {...target} onNavigate={legacyNavigate} />;
  // One delivery queue: the former Delivery Queue and Technical Work lists redirect to it,
  // and a story's technical work opens on its own Delivery tab.
  else if (path === "/am/delivery-queue") page = <Redirect to="/am/delivery" />;
  else if (path === "/am/technical") page = <Redirect to={query.get("story")
    ? `/am/changes/${encodeURIComponent(query.get("story")!)}/delivery` : "/am/delivery?stage=active"} />;
  else if (path === "/am/delivery") page = <Pipeline onOpenChange={openChange} {...target} />;
  else if (match("/am/as-built", path)) page = <AsBuiltWorkbench />;
  else if (match("/am/changes", path)) page = <Pipeline onOpenChange={openChange} {...target} />;
  else if ((m = match("/am/changes/:id/:tab?", path))) page = <ChangeView key={m.id} changeId={m.id} tab={m.tab} />;
  else page = <NotFoundPage />;

  const stage = query.get("stage");
  const isOn = (it: { to: string; stage?: string }) =>
    it.to === "/am/architecture-review" && path === "/am/process" ? true :
    it.to === "/am/delivery" && (path === "/am/delivery" || path === "/am/changes") ? true :
    it.stage ? path === "/am/changes" && stage === it.stage : path === it.to.split("?")[0];

  return (
    <div className="admin amspace">
      <aside className="adminnav" aria-label="Application Management">
        <div className="adminnav-title">Application Management</div>
        <Link to="/am" className={path === "/am" ? "on" : ""} aria-current={path === "/am" ? "page" : undefined}>Dashboard</Link>
        {GROUPS.map((g) => (
          <div key={g.label} className="adminnav-group">
            <div className="adminnav-grouplabel">{g.label}</div>
            {g.items.map((it) => (
              <Link key={it.to} to={it.to} className={isOn(it) ? "on" : ""} aria-current={isOn(it) ? "page" : undefined}>{it.label}</Link>
            ))}
          </div>
        ))}
      </aside>
      <div className="admin-main">{page}</div>
    </div>
  );
}
