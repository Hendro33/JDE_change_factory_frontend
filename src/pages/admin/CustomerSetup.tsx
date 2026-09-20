import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { CustomerProfile } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

export function CustomerSetup() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    api.getCustomerProfile().then(setProfile);
  }, []);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Customer Setup</h1>
          <div className="sub">The active customer's profile and who is entitled to it.</div>
        </div>
      </div>

      {!profile ? (
        <Loading what="the customer profile" />
      ) : (
        <div className="stack">
          <section className="panel">
            <h2>{profile.customer.name}</h2>
            <dl className="facts">
              <dt>Customer id</dt><dd className="mono">{profile.customer.id}</dd>
              <dt>Short name</dt><dd>{profile.customer.shortName}</dd>
              <dt>JDE Tools Release</dt><dd>{profile.customer.toolsRelease}</dd>
              <dt>Environment</dt><dd>{profile.customer.environment}</dd>
            </dl>
            <ApiNote endpoint="GET /admin/customer-profile" />
          </section>

          <section className="panel">
            <h2>Entitled identities</h2>
            <div className="sub" style={{ marginBottom: 12 }}>
              Who can reach this customer today. Identity/authorisation is still a documented
              stand-in for real authentication — this list comes from a static entitlement table,
              not a login system.
            </div>
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Identity id</th><th>Role</th></tr>
              </thead>
              <tbody>
                {profile.identities.map((i) => (
                  <tr key={i.id}>
                    <td>{i.displayName}</td>
                    <td className="mono">{i.id}</td>
                    <td>{i.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
