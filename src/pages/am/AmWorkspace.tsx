import { Link, match, navigate, useLocation } from "../../router";
import { EmptyState, Tabs, useSessionInfo } from "../../components/design";
import { Dashboard } from "./Dashboard";
import { ApprovalBacklog } from "./ApprovalBacklog";
import { ArchitectureReview } from "./ArchitectureReview";
import { DeliveryQueuePage } from "./DeliveryQueue";
import { Pipeline } from "./Pipeline";
import { ChangeDetail } from "./ChangeDetail";
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
    { to: "/am/changes?stage=validation", label: "Validation", stage: "validation" },
    { to: "/am/as-built", label: "As-Built" },
  ] },
  { label: "Release", items: [
    { to: "/am/changes?stage=release", label: "Ready for Release / CNC", stage: "release" },
  ] },
];

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
  else if (match("/am/backlog-review", path)) page = <ApprovalBacklog {...target} />;
  else if (match("/am/architecture-review", path) || path === "/am/process") page = <>
    <Tabs label="Architecture Review sections" active={path === "/am/process" ? "process" : query.get("view") === "design" ? "design" : "review"}
      hrefFor={(k) => `${k === "process" ? "/am/process" : "/am/architecture-review"}?${new URLSearchParams({...(query.get("story") ? {story: query.get("story")!} : {}), ...(k === "design" ? {view: "design"} : {})})}`}
      tabs={[{key: "review", label: "Architecture Review"}, {key: "process", label: "Process & Maps"}, {key: "design", label: "Technical design"}]} />
    {path === "/am/process" ? <ProcessWorkbench /> : query.get("view") === "design" ? <TechnicalWorkbench design /> : <ArchitectureReview {...target} onNavigate={legacyNavigate} />}
  </>;
  else if (["/am/delivery", "/am/delivery-queue", "/am/technical"].includes(path) || (path === "/am/changes" && (!query.get("stage") || query.get("stage") === "active"))) page = <>
    <Tabs label="Delivery sections" active={path === "/am/technical" ? "technical" : path === "/am/delivery-queue" ? "queue" : "active"}
      hrefFor={(k) => `${k === "technical" ? "/am/technical" : k === "queue" ? "/am/delivery-queue" : "/am/delivery"}${query.get("story") ? `?story=${encodeURIComponent(query.get("story")!)}` : ""}`}
      tabs={[{key: "active", label: "Delivery"}, {key: "queue", label: "Delivery Queue"}, {key: "technical", label: "Technical Work"}]} />
    {path === "/am/technical" ? <TechnicalWorkbench /> : path === "/am/delivery-queue" ? <DeliveryQueuePage onOpenChange={openChange} /> : <Pipeline onOpenChange={openChange} {...target} navFilter={{...target.navFilter, stage: "active"}} />}
  </>;
  else if (match("/am/as-built", path)) page = <AsBuiltWorkbench />;
  else if (match("/am/changes", path)) page = <Pipeline onOpenChange={openChange} {...target} />;
  else if ((m = match("/am/changes/:id", path))) page = <ChangeDetail key={m.id} changeId={m.id} onBack={() => (window.history.length > 1 ? window.history.back() : navigate("/am/changes"))} />;
  else page = <NotFoundPage />;

  const stage = query.get("stage");
  const isOn = (it: { to: string; stage?: string }) =>
    it.to === "/am/architecture-review" && path === "/am/process" ? true :
    it.to === "/am/delivery" && (["/am/delivery", "/am/delivery-queue", "/am/technical"].includes(path) || (path === "/am/changes" && (!stage || stage === "active" || stage === "all"))) ? true :
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
