import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { IntegrationStatus } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

export function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);

  useEffect(() => {
    api.listIntegrations().then(setIntegrations);
  }, []);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Integrations</h1>
          <div className="sub">What is actually connected today, honestly — not a connector marketplace.</div>
        </div>
      </div>

      {!integrations ? (
        <Loading what="integration status" />
      ) : (
        <section className="panel">
          <table className="data">
            <thead><tr><th>Integration</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.name}>
                  <td>{i.name}</td>
                  <td><span className={`badge ${i.connected ? "ok" : "grey"}`}>{i.connected ? "Connected" : "Not connected"}</span></td>
                  <td>{i.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ApiNote endpoint="GET /admin/integrations" />
        </section>
      )}
    </>
  );
}
