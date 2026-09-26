import { useEffect, useMemo, useState } from "react";
import { api, IS_MOCK_MODE } from "../../services/api";
import { processApi, type FrameworkNode } from "../../services/processApi";
import { EmptyState, HealthIndicator, Loading, PageHeader, Section, storyTitle, useAsync, useSessionInfo } from "../../components/design";
import { Link, storyPath, useLocation } from "../../router";

/** Global search results, each with its business context -- never a bare record id. */
export function SearchPage() {
  const info = useSessionInfo();
  const { query } = useLocation();
  const q = (query.get("q") ?? "").trim();
  const needle = q.toLowerCase();
  const { data: changes } = useAsync(() => api.listChanges(), []);
  const [nodes, setNodes] = useState<FrameworkNode[]>([]);
  useEffect(() => {
    if (IS_MOCK_MODE) return;
    processApi.frameworks().then(async (list) => {
      const fw = list.frameworks.find((f) => f.framework_id === list.settings.selected_framework_id) ?? list.frameworks.find((f) => f.active_version);
      if (fw?.active_version) setNodes((await processApi.version(fw.framework_id, fw.active_version)).nodes);
    }).catch(() => setNodes([]));
  }, []);

  const stories = useMemo(() => (changes ?? []).filter((c) =>
    `${c.id} ${c.title} ${c.userStory?.statement ?? ""} ${c.userStory?.businessContext ?? ""} ${(c.architectDecision?.objectsAffected ?? []).join(" ")}`.toLowerCase().includes(needle)), [changes, needle]);
  const domains = info.domains.filter((d) => `${d.name} ${d.description} ${d.apqcCode}`.toLowerCase().includes(needle));
  const procs = nodes.filter((n) => `${n.name} ${n.description} ${n.node_key}`.toLowerCase().includes(needle)).slice(0, 20);
  const byKey = new Map(nodes.map((n) => [n.node_key, n]));
  const pathOf = (n: FrameworkNode) => { const p: string[] = []; let c = n.parent_key ? byKey.get(n.parent_key) : undefined; while (c) { p.unshift(c.name); c = c.parent_key ? byKey.get(c.parent_key) : undefined; } return p.join(" › "); };

  if (!q) return <EmptyState title="Type something to search for">Search finds stories, business domains, processes and JD Edwards objects.</EmptyState>;
  if (!changes) return <Loading what="results" />;
  const none = !stories.length && !domains.length && !procs.length;
  return (
    <div>
      <PageHeader title={`Results for “${q}”`} />
      {none && <EmptyState title="Nothing found">Try a different word, a story ID or a JD Edwards object name.</EmptyState>}
      {stories.length > 0 && (
        <Section title={`Stories (${stories.length})`}>
          <ul className="resultlist">{stories.map((c) => (
            <li key={c.id}><Link to={storyPath(c.id)} className="result-title">{storyTitle(c)}</Link>
              <div className="result-context">Story · {info.domainName(c.businessDomainId) ?? "No domain yet"} · {c.lifecycle?.phaseLabel} <HealthIndicator lifecycle={c.lifecycle} /></div></li>
          ))}</ul>
        </Section>
      )}
      {domains.length > 0 && (
        <Section title={`Business domains (${domains.length})`}>
          <ul className="resultlist">{domains.map((d) => (
            <li key={d.id}><Link to={`/business/${encodeURIComponent(d.id)}`} className="result-title">{d.name}</Link><div className="result-context">Business domain{d.description ? ` · ${d.description}` : ""}</div></li>
          ))}</ul>
        </Section>
      )}
      {procs.length > 0 && (
        <Section title={`Business processes (${procs.length})`}>
          <ul className="resultlist">{procs.map((n) => (
            <li key={n.node_key}><Link to={`/business?node=${encodeURIComponent(n.node_key)}`} className="result-title">{n.name}</Link><div className="result-context">Process · {pathOf(n) || "top level"}</div></li>
          ))}</ul>
        </Section>
      )}
    </div>
  );
}
