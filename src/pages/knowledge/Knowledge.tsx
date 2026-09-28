import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { discoveryApi, type ArtifactView } from "../../services/discoveryApi";
import { KnowledgeLibrary } from "../admin/KnowledgeLibrary";
import {
  EmptyState, ErrorState, Loading, PageHeader, Section, formatDate, storyTitle, useAsync, useSessionInfo,
} from "../../components/design";
import { Link, setQueryParam, storyPath, useLocation } from "../../router";

/**
 * Knowledge: what the organisation knows about its ERP -- delivered
 * solutions (each story's as-built record becomes permanent knowledge),
 * business rules captured in stories, the JD Edwards objects JADE has
 * seen, and reference documents. Search first.
 */
export function KnowledgePage({ part }: { part?: "rules" | "solutions" | "references" }) {
  const info = useSessionInfo();
  const { query } = useLocation();
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const { data: changes, error } = useAsync(() => api.listChanges(), []);
  const [artifacts, setArtifacts] = useState<ArtifactView[]>([]);
  useEffect(() => { if (part === "references") discoveryApi.listArtifacts().then(setArtifacts).catch(() => setArtifacts([])); }, [part]);

  const delivered = useMemo(() => (changes ?? []).filter((c) => c.lifecycle?.outcome === "delivered" || c.lifecycle?.phase === "release"), [changes]);
  const rules = useMemo(() => (changes ?? []).filter((c) => c.userStory && c.lifecycle && (c.lifecycle.phaseIndex >= 2 || c.lifecycle.nextAction.action === "authorise_delivery"))
    .flatMap((c) => (c.userStory!.businessRules ?? []).map((r) => ({ rule: r, story: c }))), [changes]);
  const objects = artifacts.filter((a) => a.kind !== "reference_document" && a.latest);

  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const d = delivered.filter((c) => match(`${c.title} ${c.userStory?.statement ?? ""} ${info.domainName(c.businessDomainId) ?? ""}`));
  const r = rules.filter((x) => match(`${x.rule} ${x.story.title}`));
  const o = objects.filter((a) => match(`${String(a.meta.object_name ?? "")} ${String(a.meta.object_type ?? "")}`));

  if (!part) return <Section title="Knowledge locations">
    <ul className="quietlist"><li><Link to="/business?view=rules">Business Architecture · Business rules</Link></li>
      {info.appManagement && <li><Link to="/am/as-built">Application Management · Delivered solutions and As-Built</Link></li>}
      {info.admin && <li><Link to="/admin/connections/references">Administration · Manuals, ERP documentation and technical references</Link></li>}</ul>
    </Section>;
  if (error) return <ErrorState error={error} title="Knowledge could not be loaded" />;
  if (!changes) return <Loading what="knowledge" />;

  return (
    <div>
      <PageHeader title={part === "rules" ? "Business rules" : part === "solutions" ? "Delivered solutions" : "ERP documentation & technical references"} />
      <div className="toolbar" role="search">
        <input type="search" className="searchbox big" aria-label="Search knowledge" placeholder="Search solutions, rules, objects…"
               value={query.get("q") ?? ""} onChange={(e) => setQueryParam("q", e.target.value)}  />
      </div>

      {part === "solutions" && <Section title={`Delivered solutions (${d.length})`} description="Each delivered story keeps its business outcome and as-built record.">
        {d.length === 0 ? <EmptyState title={q ? "No delivered solutions match" : "Nothing delivered yet"} /> : (
          <ul className="knowledgelist">{d.map((c) => (
            <li key={c.id}>
              <Link to={storyPath(c.id, "delivery", "release")}>{storyTitle(c)}</Link>
              <div className="muted small">{info.domainName(c.businessDomainId) ?? "No domain"} · {c.lifecycle?.outcome === "delivered" ? `delivered ${formatDate(c.updatedAt)}` : "validated, release pending"}</div>
            </li>
          ))}</ul>
        )}
      </Section>}

      {part === "rules" && <Section title={`Business rules (${r.length})`} description="Rules and controls stated in approved stories.">
        {r.length === 0 ? <EmptyState title={q ? "No rules match" : "No business rules recorded yet"} /> : (
          <ul className="knowledgelist">{r.slice(0, 50).map((x, i) => (
            <li key={i}>{x.rule}<div className="muted small">From <Link to={storyPath(x.story.id, "story")}>{storyTitle(x.story)}</Link></div></li>
          ))}</ul>
        )}
      </Section>}

      {part === "references" && (
        <Section title={`JD Edwards objects (${o.length})`} description="Object sources imported for JADE's analysis.">
          {o.length === 0 ? <EmptyState title={q ? "No objects match" : "No objects imported yet"} /> : (
            <table className="data"><thead><tr><th>Object</th><th>Type</th><th>Environment</th><th>Added</th></tr></thead>
              <tbody>{o.map((a) => (
                <tr key={a.artifactId}><td className="mono">{String(a.meta.object_name ?? a.artifactId)}</td><td>{String(a.meta.object_type ?? "")}</td>
                  <td>{String(a.meta.customer_environment ?? "")}</td><td>{formatDate(a.uploadedAt)}</td></tr>
              ))}</tbody></table>
          )}
        </Section>
      )}

      {part === "references" && <KnowledgeLibrary readOnly={!info.has("admin")} />}
    </div>
  );
}
