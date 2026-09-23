import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { BusinessDomain, CompanyRole, CompanyUsersOut, InvitationOut, MembershipOut } from "../../types/domain";
import { ApiNote, Loading } from "../../components/ui";

const ALL_ROLES: CompanyRole[] = ["admin", "domain_owner", "product_manager", "dashboard_viewer"];
const ROLE_LABEL: Record<CompanyRole, string> = {
  admin: "Admin",
  domain_owner: "Domain Owner",
  product_manager: "Product Manager",
  dashboard_viewer: "Dashboard Viewer",
};

function RoleAndDomainPicker({
  roles, domainIds, domains, onChangeRoles, onChangeDomainIds,
}: {
  roles: CompanyRole[];
  domainIds: string[];
  domains: BusinessDomain[];
  onChangeRoles: (roles: CompanyRole[]) => void;
  onChangeDomainIds: (ids: string[]) => void;
}) {
  function toggleRole(role: CompanyRole) {
    onChangeRoles(roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);
  }
  function toggleDomain(id: string) {
    onChangeDomainIds(domainIds.includes(id) ? domainIds.filter((d) => d !== id) : [...domainIds, id]);
  }

  return (
    <div className="stack">
      <div className="field">
        <label>Roles</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {ALL_ROLES.map((role) => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
              {ROLE_LABEL[role]}
            </label>
          ))}
        </div>
      </div>
      {roles.includes("domain_owner") && (
        <div className="field">
          <label>Assigned business domains <span className="hint">(Domain Owner is scoped to these only)</span></label>
          {domains.length === 0 ? (
            <span className="hint">No business domains exist yet for this company.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {domains.map((d) => (
                <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
                  <input type="checkbox" checked={domainIds.includes(d.id)} onChange={() => toggleDomain(d.id)} />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InviteForm({ domains, onInvited }: { domains: BusinessDomain[]; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [domainIds, setDomainIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const invitation = await api.inviteUser({ email: email.trim(), roles, domainIds });
      setEmail("");
      setRoles([]);
      setDomainIds([]);
      setPreviewUrl(invitation.previewUrl ?? null);
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="inviteEmail">Email</label>
        <input id="inviteEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
      </div>
      <RoleAndDomainPicker roles={roles} domainIds={domainIds} domains={domains} onChangeRoles={setRoles} onChangeDomainIds={setDomainIds} />
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {previewUrl && (
        <div className="callout">
          <strong>Dev preview</strong> — no email service is configured yet, so nothing was actually sent. Share
          this link with the invited person yourself: <span className="mono">{previewUrl}</span>
        </div>
      )}
      <div className="btnrow">
        <button className="btn primary" disabled={sending || !email.trim() || roles.length === 0} onClick={submit}>
          {sending ? "Sending…" : "Send invitation"}
        </button>
      </div>
    </div>
  );
}

function MemberRow({
  member, domains, onChanged,
}: {
  member: MembershipOut;
  domains: BusinessDomain[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<CompanyRole[]>(member.roles);
  const [domainIds, setDomainIds] = useState<string[]>(member.domainIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function issueResetLink() {
    setBusy(true);
    setError(null);
    setResetLink(null);
    try {
      const r = await api.issuePasswordResetLink(member.membershipId);
      setResetLink(r.previewUrl ?? "Sent to their email address.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a reset link.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoles() {
    setBusy(true);
    setError(null);
    try {
      await api.updateMembershipRoles(member.membershipId, { roles, domainIds });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update roles.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      if (member.status === "active") await api.deactivateMembership(member.membershipId);
      else await api.reactivateMembership(member.membershipId);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{member.displayName}<div className="hint">{member.email}</div></td>
      <td><span className={`badge ${member.status === "active" ? "ok" : "grey"}`}>{member.status === "active" ? "Active" : "Inactive"}</span></td>
      <td>
        {editing ? (
          <RoleAndDomainPicker roles={roles} domainIds={domainIds} domains={domains} onChangeRoles={setRoles} onChangeDomainIds={setDomainIds} />
        ) : (
          <>
            {member.roles.map((r) => ROLE_LABEL[r]).join(", ") || <span className="notstated">no roles</span>}
            {member.domainIds.length > 0 && <div className="hint">Domains: {member.domainIds.join(", ")}</div>}
          </>
        )}
        {error && <div className="hint" style={{ color: "var(--stop)" }}>{error}</div>}
        {resetLink && (
          <div className="hint" style={{ wordBreak: "break-all" }}>
            Reset link (no email service is configured, so hand it over yourself; valid once): {resetLink}
          </div>
        )}
      </td>
      <td>
        <div className="btnrow">
          {editing ? (
            <>
              <button className="btn primary" disabled={busy} onClick={saveRoles}>{busy ? "Saving…" : "Save"}</button>
              <button className="btn" disabled={busy} onClick={() => { setEditing(false); setRoles(member.roles); setDomainIds(member.domainIds); setError(null); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => setEditing(true)}>Edit roles</button>
              {member.status === "active" && (
                <button className="btn" disabled={busy} onClick={issueResetLink}>Reset link</button>
              )}
              <button className="btn danger" disabled={busy} onClick={toggleStatus}>
                {busy ? "…" : member.status === "active" ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function InvitationRow({ invitation, onChanged }: { invitation: InvitationOut; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.resendInvitation(invitation.id);
      setPreviewUrl(updated.previewUrl ?? null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await api.revokeInvitation(invitation.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke the invitation.");
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    invitation.status === "pending" ? "warn" : invitation.status === "accepted" ? "ok" : "grey";

  return (
    <tr>
      <td>{invitation.email}</td>
      <td><span className={`badge ${statusBadge}`}>{invitation.status}</span></td>
      <td>{invitation.roles.map((r) => ROLE_LABEL[r]).join(", ")}</td>
      <td>{invitation.invitedByDisplayName}</td>
      <td>
        {invitation.status === "pending" && (
          <div className="btnrow">
            <button className="btn" disabled={busy} onClick={resend}>{busy ? "…" : "Resend"}</button>
            <button className="btn danger" disabled={busy} onClick={revoke}>{busy ? "…" : "Revoke"}</button>
          </div>
        )}
        {error && <div className="hint" style={{ color: "var(--stop)" }}>{error}</div>}
        {previewUrl && (
          <div className="hint">
            Dev preview link: <span className="mono">{previewUrl}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

export function Users() {
  const [data, setData] = useState<CompanyUsersOut | null>(null);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  function load() {
    api
      .listCompanyUsers()
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load this company's users."));
    api.listBusinessDomains().then(setDomains).catch(() => setDomains([]));
  }

  useEffect(load, []);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Users</h1>
          <div className="sub">Company member list, invitations, roles and business-domain assignments.</div>
        </div>
        {data && (
          <button className="btn primary" onClick={() => setInviting((v) => !v)}>
            {inviting ? "Close" : "Invite user"}
          </button>
        )}
      </div>

      {loadError ? (
        <div className="callout">
          <strong>Admin role required</strong>
          Only company Admins can manage users and invitations. {loadError}
        </div>
      ) : !data ? (
        <Loading what="company users" />
      ) : (
        <>
          {inviting && (
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Invite a user</h2>
              <InviteForm domains={domains} onInvited={load} />
            </section>
          )}

          <section className="panel" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Members</h2>
            {data.members.length === 0 ? (
              <p className="notstated">No members yet.</p>
            ) : (
              <table className="data">
                <thead><tr><th>Name</th><th>Status</th><th>Roles</th><th></th></tr></thead>
                <tbody>
                  {data.members.map((m) => (
                    <MemberRow key={m.membershipId} member={m} domains={domains} onChanged={load} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0 }}>Invitations</h2>
            {data.invitations.length === 0 ? (
              <p className="notstated">No invitations yet.</p>
            ) : (
              <table className="data">
                <thead><tr><th>Email</th><th>Status</th><th>Roles</th><th>Invited by</th><th></th></tr></thead>
                <tbody>
                  {data.invitations.map((i) => (
                    <InvitationRow key={i.id} invitation={i} onChanged={load} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <ApiNote endpoint="GET /admin/users, POST /admin/users/invite, PUT /admin/users/{id}/roles, POST /admin/users/{id}/deactivate|reactivate, POST /admin/users/invitations/{id}/resend|revoke" />
        </>
      )}
    </>
  );
}
