import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { BusinessDomain, CompanyRole, CompanyUsersOut, InvitationOut, MembershipOut, PasswordResetLinkOut } from "../../types/domain";
import { Loading } from "../../components/ui";
import { useSessionInfo } from "../../components/design";
import { saveErrorMessage } from "../../services/saveErrors";

const ALL_ROLES: CompanyRole[] = ["admin", "domain_owner", "product_manager", "dashboard_viewer", "cnc_operator", "test_manager"];
const ROLE_LABEL: Record<CompanyRole, string> = {
  test_manager: "Test Manager",
  admin: "Admin",
  domain_owner: "Domain Owner",
  product_manager: "Application Manager",
  dashboard_viewer: "Dashboard Viewer",
  cnc_operator: "CNC Operator",
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

/** What happened to an invitation or reset link: e-mailed, or -- when it
 * could not be -- the link for the Administrator to hand over personally. */
function DeliveryNote({ email, emailSent, detail, link, what }: {
  email: string; emailSent: boolean; detail?: string; link?: string | null; what: string;
}) {
  // Test phase (24 Oct): the Administrator always gets the link too, so a test user can be set up without a mailbox.
  if (emailSent) {
    return (
      <div className="callout" role="status" style={{ wordBreak: "break-all" }}>
        The {what} was e-mailed to {email}.{link && <> You can also give it to them yourself -- it is personal and works once:{" "}
          <span className="mono">{link}</span></>}
      </div>
    );
  }
  return (
    <div className="callout" role="status" style={{ wordBreak: "break-all" }}>
      <strong>Not e-mailed</strong>{detail ? ` (${detail})` : ""}. Give this {what} to {email} yourself -- it is
      personal and works once: <span className="mono">{link}</span>
    </div>
  );
}

function InviteForm({ domains, onInvited }: { domains: BusinessDomain[]; onInvited: () => void }) {
  // Two ways to add a person: create them with a password you give them (the usual way in a business
  // application, no e-mail needed), or send an invitation link by e-mail.
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [domainIds, setDomainIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvitationOut | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    setSent(null);
    setCreated(null);
    try {
      if (mode === "password") {
        const member = await api.createUser({ email: email.trim(), displayName: displayName.trim(), password, roles, domainIds });
        setCreated(member.email);
      } else {
        setSent(await api.inviteUser({ email: email.trim(), roles, domainIds }));
      }
      setEmail(""); setDisplayName(""); setPassword(""); setRoles([]); setDomainIds([]);
      onInvited();
    } catch (e) {
      setError(e instanceof Error ? e.message : mode === "password" ? "Could not create the user." : "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  }

  const ready = !!email.trim() && roles.length > 0 && (mode === "invite" || password.length >= 8);
  return (
    <div className="stack">
      <div className="segmented" role="radiogroup" aria-label="How to add this person">
        <button type="button" role="radio" aria-checked={mode === "password"} className={mode === "password" ? "on" : ""} onClick={() => setMode("password")}>Create with a password</button>
        <button type="button" role="radio" aria-checked={mode === "invite"} className={mode === "invite" ? "on" : ""} onClick={() => setMode("invite")}>Send an invitation</button>
      </div>
      <div className="field">
        <label htmlFor="inviteEmail">Email (their login name)</label>
        <input id="inviteEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
      </div>
      {mode === "password" && (
        <>
          <div className="field">
            <label htmlFor="newName">Name</label>
            <input id="newName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="First and last name" />
          </div>
          <div className="field">
            <label htmlFor="newPassword">Password (at least 8 characters)</label>
            <input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="hint">If this person already has a login, they are added to this customer and keep their own password.</div>
          </div>
        </>
      )}
      <RoleAndDomainPicker roles={roles} domainIds={domainIds} domains={domains} onChangeRoles={setRoles} onChangeDomainIds={setDomainIds} />
      {error && <div className="callout" style={{ borderColor: "var(--stop)" }}>{error}</div>}
      {created && <div className="callout" role="status">{created} can sign in now with the password you chose.</div>}
      {sent && <DeliveryNote email={sent.email} emailSent={!!sent.emailSent} detail={sent.emailDetail}
                             link={sent.previewUrl} what="invitation" />}
      <div className="btnrow">
        <button className="btn primary" disabled={sending || !ready} onClick={submit}>
          {sending ? "Saving…" : mode === "password" ? "Create user" : "Send invitation"}
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
  const [reset, setReset] = useState<PasswordResetLinkOut | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwDone, setPwDone] = useState(false);

  async function savePassword() {
    setBusy(true); setError(null); setPwDone(false);
    try {
      await api.setUserPassword(member.membershipId, pw);
      setPw(""); setPwOpen(false); setPwDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  }

  async function issueResetLink() {
    setBusy(true);
    setError(null);
    setReset(null);
    try {
      setReset(await api.issuePasswordResetLink(member.membershipId));
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
      await api.updateMembershipRoles(member.membershipId, { roles, domainIds, expectedRevision: member.revision });
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
      if (member.status === "active") await api.deactivateMembership(member.membershipId, member.revision);
      else await api.reactivateMembership(member.membershipId, member.revision);
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
            {member.domainIds.length > 0 && <div className="hint">Domains: {member.domainIds.map((id) => domains.find((d) => d.id === id)?.name ?? id).join(", ")}</div>}
          </>
        )}
        {error && <div className="hint" style={{ color: "var(--stop)" }}>{error}</div>}
        {reset && <DeliveryNote email={member.email} emailSent={reset.sent} detail={reset.detail}
                                link={reset.previewUrl} what="password reset link" />}
        {pwOpen && (
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={`pw-${member.membershipId}`}>New password for {member.email} (at least 8 characters)</label>
            <input id={`pw-${member.membershipId}`} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <div className="btnrow" style={{ marginTop: 6 }}>
              <button className="btn primary" disabled={busy || pw.length < 8} onClick={savePassword}>{busy ? "Saving…" : "Save password"}</button>
              <button className="btn" disabled={busy} onClick={() => { setPwOpen(false); setPw(""); }}>Cancel</button>
            </div>
          </div>
        )}
        {pwDone && <div className="callout" role="status">Password set. Give it to {member.email}; they can sign in with it now.</div>}
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
                <>
                  <button className="btn" disabled={busy} onClick={() => { setPwOpen(true); setPwDone(false); }}>Set password</button>
                  <button className="btn" disabled={busy} onClick={issueResetLink}>Reset link</button>
                </>
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
  const [resent, setResent] = useState<InvitationOut | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.resendInvitation(invitation.id);
      setResent(updated);
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
        {resent && <DeliveryNote email={resent.email} emailSent={!!resent.emailSent} detail={resent.emailDetail}
                                 link={resent.previewUrl} what="invitation" />}
      </td>
    </tr>
  );
}

export function Users() {
  const isAdmin = useSessionInfo().has("admin");
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
      .catch((e) => setLoadError(saveErrorMessage(e, "Could not load this company's users.")));
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
            {inviting ? "Close" : "Add user"}
          </button>
        )}
      </div>

      {loadError ? (
        isAdmin ? (
          <div className="callout" role="alert" style={{ borderColor: "var(--stop)" }}>
            <strong>Could not load this company's users</strong>
            {loadError}
          </div>
        ) : (
          <div className="callout">
            <strong>Admin role required</strong>
            Only company Admins can manage users and invitations. {loadError}
          </div>
        )
      ) : !data ? (
        <Loading what="company users" />
      ) : (
        <>
          {inviting && (
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Add a user</h2>
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

        </>
      )}
    </>
  );
}
