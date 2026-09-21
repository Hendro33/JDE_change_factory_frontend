import { useState } from "react";
import { authApi } from "../../services/httpApi";

/** Reached via a "?resetToken=..." link (see auth.py's own comment on
 * why this is a query param on the root path, not a distinct route --
 * this frontend has no client-side router). */
export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && newPassword !== confirm;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the password -- the link may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authscreen">
      <div className="authcard">
        <h1 style={{ marginTop: 0 }}>Choose a new password</h1>
        {done ? (
          <>
            <div className="callout">Your password has been changed. Sign in with it below.</div>
            <div className="btnrow">
              <button className="btn primary" onClick={onDone}>Go to sign in</button>
            </div>
          </>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword" type="password" autoComplete="new-password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} required minLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required
              />
              {mismatch && <span className="hint" style={{ color: "var(--stop)" }}>Passwords don't match.</span>}
            </div>
            {error && (
              <div className="callout" style={{ borderColor: "var(--stop)" }}>
                {error}
              </div>
            )}
            <div className="btnrow">
              <button
                className="btn primary" type="submit"
                disabled={submitting || newPassword.length < 8 || mismatch}
              >
                {submitting ? "Saving…" : "Set new password"}
              </button>
              <button type="button" className="btn" onClick={onDone}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
