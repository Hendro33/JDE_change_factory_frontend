import { KnowledgePage } from "../knowledge/Knowledge";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { processApi, type FrameworkNode, type VersionPreview } from "../../services/processApi";
import type { Change } from "../../types/domain";
import {
  EmptyState, ErrorState, Loading, PageHeader, Section, Tag, storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, setQueryParam, storyPath, useLocation } from "../../router";
import { StoryTable } from "../stories/Stories";

/**
 * Business Architecture: the organisation's ERP map as JADE understands
 * it -- business domains, the processes inside them, and the stories in
 * each. The process framework (APQC or the customer's own) is how the map
 * is structured; people experience their business, not a configuration.
 */
export function BusinessArchitecturePage({ domainId }: { domainId?: string }) {
  const info = useSessionInfo();
  const { data: changes, error } = useAsync(() => api.listChanges(), []);
  const { query } = useLocation();
  const node = query.get("node");

  if (error) return <ErrorState error={error} title="Business architecture could not be loaded" />;
  if (!changes) return <Loading what="business architecture" />;
  if (domainId) return <DomainView domainId={domainId} changes={changes} />;

  const counts = (id: string | null) => {
    const mine = changes.filter((c) => (c.businessDomainId ?? null) === id);
    return { open: mine.filter((c) => c.lifecycle?.phase !== "done").length, done: mine.filter((c) => c.lifecycle?.outcome === "delivered").length };
  };
  const unplaced = counts(null);
  const active = info.domains.filter((d) => d.status !== "retired");

  return (
    <div>
      <PageHeader title="Business Architecture" subtitle="Your organisation's ERP map: business domains, their processes, and the change happening in each." />
      <Section title="Business domains" actions={info.has("admin") ? <Link to="/admin/business-model">Manage domains</Link> : undefined}>
        {active.length === 0 ? <EmptyState title="No business domains yet">An administrator sets them up under Administration › Business Model.</EmptyState> : (
          <div className="domaingrid">
            {active.map((d) => {
              const n = counts(d.id);
              return (
                <Link key={d.id} to={`/business/${encodeURIComponent(d.id)}`} className="domaincard">
                  <span className="domaincard-name">{d.name}</span>
                  {d.description && <span className="domaincard-desc">{d.description}</span>}
                  <span className="domaincard-stats"><strong>{n.open}</strong> active stor{n.open === 1 ? "y" : "ies"} · {n.done} delivered</span>
                  <span className="domaincard-owner">{(d.assignedOwners ?? []).length ? `Owner: ${d.assignedOwners!.join(", ")}` : "No Domain Owner assigned"}</span>
                  {d.status === "proposed" && <Tag tone="warn">Proposed</Tag>}
                </Link>
              );
            })}
            {unplaced.open > 0 && (
              <Link to="/stories?domain=none" className="domaincard muted-card">
                <span className="domaincard-name">Not placed yet</span>
                <span className="domaincard-stats"><strong>{unplaced.open}</strong> stor{unplaced.open === 1 ? "y" : "ies"} waiting to be placed in a domain</span>
              </Link>
            )}
          </div>
        )}
      </Section>
      <ProcessMap selected={node} changes={changes} />
      <KnowledgePage part="rules" />
    </div>
  );
}

function DomainView({ domainId, changes }: { domainId: string; changes: Change[] }) {
  const info = useSessionInfo();
  const d = info.domains.find((x) => x.id === domainId);
  const mine = changes.filter((c) => c.businessDomainId === domainId);
  const open = mine.filter((c) => c.lifecycle?.phase !== "done");
  const done = mine.filter((c) => c.lifecycle?.phase === "done");
  if (!d) return <ErrorState title="This business domain could not be found" error={new Error("It may have been removed or belong to another customer.")} />;
  return (
    <div>
      <div className="crumbs"><Link to="/business">Business Architecture</Link> <span aria-hidden="true">/</span> {d.name}</div>
      <PageHeader title={d.name} subtitle={d.description || undefined}
        eyebrow={d.apqcCode ? `Process classification ${d.apqcCode}` : undefined} />
      <div className="factrow">
        <div><div className="fact-label">Domain Owner</div><div>{(d.assignedOwners ?? []).join(", ") || <span className="muted">None assigned — nobody can approve stories here</span>}</div></div>
        <div><div className="fact-label">Active stories</div><div className="bignum">{open.length}</div></div>
        <div><div className="fact-label">Delivered</div><div className="bignum">{done.filter((c) => c.lifecycle?.outcome === "delivered").length}</div></div>
      </div>
      <Section title="Active stories">
        {open.length ? <StoryTable rows={open} compact /> : <EmptyState title="No active stories in this domain" />}
      </Section>
      {done.length > 0 && (
        <Section title="Delivered and closed">
          <ul className="quietlist">{done.map((c) => <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link> <span className="muted">— {c.lifecycle?.outcome === "delivered" ? "delivered" : "closed"}</span></li>)}</ul>
        </Section>
      )}
    </div>
  );
}

/** The active process framework as a browsable tree, with the stories mapped to a selected process. */
function ProcessMap({ selected, changes }: { selected: string | null; changes: Change[] }) {
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [nodeStories, setNodeStories] = useState<string[] | null>(null);

  useEffect(() => {
    processApi.frameworks().then(async (list) => {
      const fw = list.frameworks.find((f) => f.framework_id === list.settings.selected_framework_id) ?? list.frameworks.find((f) => f.active_version);
      if (!fw || !fw.active_version) { setPreview(null); return; }
      setPreview(await processApi.version(fw.framework_id, fw.active_version));
    }).catch(setError);
  }, []);

  const nodes = preview?.nodes ?? [];
  const children = useMemo(() => {
    const m = new Map<string | null, FrameworkNode[]>();
    nodes.forEach((n) => m.set(n.parent_key, [...(m.get(n.parent_key) ?? []), n]));
    m.forEach((v) => v.sort((a, b) => a.position - b.position));
    return m;
  }, [nodes]);
  const byKey = useMemo(() => new Map(nodes.map((n) => [n.node_key, n])), [nodes]);

  // Open the path to a selected node (e.g. from a story's process link).
  useEffect(() => {
    if (!selected || !byKey.size) return;
    const path = new Set<string>();
    let cur = byKey.get(selected);
    while (cur?.parent_key) { path.add(cur.parent_key); cur = byKey.get(cur.parent_key); }
    setOpen((o) => new Set([...o, ...path]));
    if (preview) processApi.nodeStories(preview.framework.framework_id, selected).then((r) => setNodeStories(r.map((x) => x.story_id))).catch(() => setNodeStories([]));
  }, [selected, byKey.size, preview]);

  if (error) return <ErrorState error={error} title="The process map could not be loaded" />;
  if (!preview) return (
    <Section title="Processes">
      <EmptyState title="No process framework is active">An administrator imports and activates one (APQC or the customer's own) under Administration › Business Model.</EmptyState>
    </Section>
  );

  const selectedNode = selected ? byKey.get(selected) : undefined;
  const path: FrameworkNode[] = [];
  let cur = selectedNode;
  while (cur) { path.unshift(cur); cur = cur.parent_key ? byKey.get(cur.parent_key) : undefined; }
  const storyRows = changes.filter((c) => nodeStories?.includes(c.id));

  const renderNodes = (parent: string | null, depth: number): JSX.Element | null => {
    const kids = children.get(parent) ?? [];
    if (!kids.length) return null;
    return (
      <ul className={`tree d${depth}`}>{kids.map((n) => {
        const hasKids = (children.get(n.node_key) ?? []).length > 0;
        const isOpen = open.has(n.node_key);
        return (
          <li key={n.node_key}>
            <div className={`tree-row${n.node_key === selected ? " on" : ""}`}>
              {hasKids ? (
                <button className="tree-toggle" aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${n.name}`}
                        onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(n.node_key)) x.delete(n.node_key); else x.add(n.node_key); return x; })}>
                  {isOpen ? "▾" : "▸"}</button>
              ) : <span className="tree-toggle" aria-hidden="true" />}
              <button className="tree-name" onClick={() => setQueryParam("node", n.node_key)}>{n.name}</button>
              <span className="tree-key mono">{n.node_key}</span>
            </div>
            {hasKids && isOpen && renderNodes(n.node_key, depth + 1)}
          </li>
        );
      })}</ul>
    );
  };

  return (
    <Section title="Processes" description={<>Framework: <strong>{preview.framework.name}</strong> (version {preview.version.version})
      {preview.framework.source_kind === "synthetic_fixture" && <> <Tag tone="warn">Synthetic test framework</Tag></>}</>}>
      <div className="processmap">
        <div className="processmap-tree">{renderNodes(null, 0)}</div>
        <div className="processmap-detail">
          {!selectedNode ? <p className="muted">Choose a process to see its place in the business and the stories that change it.</p> : (
            <>
              <div className="muted small">{path.slice(0, -1).map((p) => p.name).join(" › ")}</div>
              <h3>{selectedNode.name}</h3>
              {selectedNode.description && <p>{selectedNode.description}</p>}
              <div className="minihead">Stories that change this process</div>
              {nodeStories === null ? <Loading /> : storyRows.length === 0 ? <p className="muted">None yet.</p> : (
                <ul className="quietlist">{storyRows.map((c) => <li key={c.id}><Link to={storyPath(c.id)}>{storyTitle(c)}</Link> <span className="muted">— {c.lifecycle?.phaseLabel}</span></li>)}</ul>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
