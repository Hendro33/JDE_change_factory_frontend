import { Link, match, navigate, useLocation } from "../../router";
import { EmptyState, useSessionInfo } from "../../components/design";
import { Dashboard } from "./Dashboard";
import { ApprovalBacklog } from "./ApprovalBacklog";
import { ArchitectureReview } from "./ArchitectureReview";
import { DeliveryQueuePage } from "./DeliveryQueue";
import { Pipeline } from "./Pipeline";
import { ChangeDetail } from "./ChangeDetail";
import { AsBuiltWorkbench, ProcessWorkbench, TechnicalWorkbench } from "./Workbenches";
import { legacyNavigate, openChange, useNavTarget } from "./legacyNav";
import { NotFoundPage } from "../NotFound";

/**
 * Application Management: the ERP Application Manager's own workspace.
 * It takes approved user stories through architecture, the delivery
 * backlog, implementation, validation and release to the as-built record.
 * The screens and their order are the original Application Manager
 * process; they are grouped exactly as before (Governance, Delivery,
 * Release) and each has a permanent address.
 */
const GROUPS: { label: string; items: { to: string; label: string; stage?: string }[] }[] = [
  { label: "Governance", items: [
    { to: "/am/backlog-review", label: "Backlog Review" },
    { to: "/am/architecture-review", label: "Architecture Review" },
  ] },
  { label: "Delivery", items: [
    { to: "/am/delivery-queue", label: "Delivery Queue" },
    { to: "/am/process", label: "Process & Maps" },
    { to: "/am/technical", label: "Technical Work" },
    { to: "/am/as-built", label: "As-built Records" },
    { to: "/am/changes?stage=active", label: "Active Changes", stage: "active" },
    { to: "/am/changes?stage=validation", label: "Validation", stage: "validation" },
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
  else if (match("/am/architecture-review", path)) page = <ArchitectureReview {...target} onNavigate={legacyNavigate} />;
  else if (match("/am/delivery-queue", path)) page = <DeliveryQueuePage onOpenChange={openChange} />;
  else if (match("/am/process", path)) page = <ProcessWorkbench />;
  else if (match("/am/technical", path)) page = <TechnicalWorkbench />;
  else if (match("/am/as-built", path)) page = <AsBuiltWorkbench />;
  else if (match("/am/changes", path)) page = <Pipeline onOpenChange={openChange} {...target} />;
  else if ((m = match("/am/changes/:id", path))) page = <ChangeDetail key={m.id} changeId={m.id} onBack={() => (window.history.length > 1 ? window.history.back() : navigate("/am/changes"))} />;
  else page = <NotFoundPage />;

  const stage = query.get("stage");
  const isOn = (it: { to: string; stage?: string }) =>
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
