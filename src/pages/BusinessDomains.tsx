import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { BusinessDomain } from "../types/domain";
import type { Navigate } from "../types/nav";
import { ApiNote, Loading, NotStated } from "../components/ui";

/**
 * The customer's business domain taxonomy (Increment: domain-aware
 * governance / Continuous Delivery Flow navigation). A small,
 * representative set classified against APQC — not the full
 * catalogue. Clicking a domain jumps to User Stories filtered to it.
 */
export function BusinessDomains({ onNavigate }: { onNavigate: Navigate }) {
  const [domains, setDomains] = useState<BusinessDomain[] | null>(null);

  useEffect(() => { api.listBusinessDomains().then(setDomains); }, []);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Business Domains</h1>
          <div className="sub">
            The customer's own business taxonomy, classified against APQC — the ownership hook
            for the User Stories raised against each one.
          </div>
        </div>
        <div className="meta">{domains?.length ?? 0} domains</div>
      </div>

      {!domains ? <Loading what="business domains" /> : domains.length === 0 ? (
        <div className="empty">No business domains defined for this customer yet.</div>
      ) : (
        <section className="panel">
          <table className="data">
            <thead>
              <tr><th>APQC code</th><th>Domain</th><th>Level</th><th>Domain Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => onNavigate("userstories", { view: "all", domainId: d.id })}>
                  <td className="mono">{d.apqcCode}</td>
                  <td>
                    <div>{d.name}</div>
                    {d.description && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{d.description}</div>}
                  </td>
                  <td className="mono">{d.level}</td>
                  <td>{d.domainOwner || <NotStated />}</td>
                  <td><span className={`badge ${d.status === "active" ? "ok" : "grey"}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ApiNote endpoint="GET /business-domains" />
        </section>
      )}
    </>
  );
}
