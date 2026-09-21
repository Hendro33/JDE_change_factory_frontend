import { useEffect, useState } from "react";
import { authApi } from "../../services/httpApi";
import type { InvitationPreview } from "../../types/domain";

/** Reached via a "?acceptInvitation=..." link -- see ResetPassword's
 * own comment on why this is a query param, not a route. */
export function AcceptInvitation({ token, onAccepted, onGoToLogin }: {
  token: string;
  onAccepted: () => void;
  onGoToLogin: () => void;
}) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<{ email: string } | "signed-out" | "checking">("checking");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    authApi.previewInvitation(token).then(setPreview).catch((e) => {
      setLoadError(e instanceof Error ? e.message : "Could not load this invitation.");
    });
    authApi.me().then(setMe).catch(() => setMe("signed-out"));
  }, [token]);

  async function acceptAsNewUser() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await authApi.acceptInvitation({ token, password, displayName: displayName.trim() || undefined });
      onAccepted();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not accept this invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptAsExistingUser() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await authApi.acceptInvitationAsExistingUser(token);
      onAccepted();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not accept this invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="authscreen">
        <div className="authcard">
          <h1 style={{ marginTop: 0 }}>Invitation</h1>
          <div className="callout" style={{ borderColor: "var(--stop)" }}>{loadError}</div>
          <div className="btnrow"><button className="btn" onClick={onGoToLogin}>Go to sign in</button></div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="authscreen">
        <div className="authcard"><p>Loading invitation…</p></div>
      </div>
    );
  }

  if (!preview.valid) {
    return (
      <div className="authscreen">
        <div className="authcard">
          <h1 style={{ marginTop: 0 }}>Invitation no longer valid</h1>
          <div className="callout" style={{ borderColor: "var(--stop)" }}>
            {preview.reason ?? "This invitation link can no longer be used."} Ask your company's Admin for a new one.
          </div>
          <div className="btnrow"><button className="btn" onClick={onGoToLogin}>Go to sign in</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="authscreen">
      <div className="authcard">
        <h1 style={{ marginTop: 0 }}>Join {preview.companyName}</h1>
        <p className="sub">
          {preview.email} has been invited with the role{preview.roles.length === 1 ? "" : "s"}:{" "}
          <strong>{preview.roles.join(", ")}</strong>.
        </p>

        {preview.requiresPassword ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              acceptAsNewUser();
            }}
          >
            <div className="field">
              <label htmlFor="inviteDisplayName">Your name</label>
              <input id="inviteDisplayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="invitePassword">Choose a password</label>
              <input
                id="invitePassword" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={8}
              />
            </div>
            {submitError && <div className="callout" style={{ borderColor: "var(--stop)" }}>{submitError}</div>}
            <div className="btnrow">
              <button className="btn primary" type="submit" disabled={submitting || password.length < 8}>
                {submitting ? "Joining…" : "Create account and join"}
              </button>
            </div>
          </form>
        ) : me === "checking" ? (
          <p>Checking your sign-in status…</p>
        ) : me !== "signed-out" && me.email.toLowerCase() === preview.email.toLowerCase() ? (
          <div className="stack">
            {submitError && <div className="callout" style={{ borderColor: "var(--stop)" }}>{submitError}</div>}
            <div className="btnrow">
              <button className="btn primary" disabled={submitting} onClick={acceptAsExistingUser}>
                {submitting ? "Joining…" : `Accept and join ${preview.companyName}`}
              </button>
            </div>
          </div>
        ) : me !== "signed-out" ? (
          <div className="callout">
            You're signed in as {me.email}, but this invitation is for {preview.email}. Sign out, sign in as{" "}
            {preview.email}, then reopen this link.
          </div>
        ) : (
          <div className="stack">
            <div className="callout">An account already exists for {preview.email}. Sign in, then reopen this link to accept.</div>
            <div className="btnrow"><button className="btn primary" onClick={onGoToLogin}>Go to sign in</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
