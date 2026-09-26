import { useState } from "react";
import { authApi } from "../../services/httpApi";

/**
 * Real login, replacing the old X-Demo-User-Id header trust. Only ever
 * rendered when VITE_USE_MOCK_API=false — the mock service keeps its
 * own persona picker (footer), which has no real credentials to check.
 */
export function Login({ onSignedIn, notice }: { onSignedIn: () => void; notice?: string | null }) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState<string | null>(null);

  async function submitLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.login(email.trim(), password);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitForgot() {
    setSubmitting(true);
    setError(null);
    setForgotSent(null);
    try {
      await authApi.forgotPassword(email.trim());
      setForgotSent(
        "If that email is registered and email delivery is set up, a reset link is on its way. " +
          "No email service is configured on this server yet, so in practice: ask your company's Admin " +
          "to create a reset link for you under Admin > Users."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request a password reset.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authscreen">
      <div className="authcard">
        <div className="brandmark" style={{ marginBottom: 24 }}>
          <span className="logo">consult<b>IQ</b></span>
          <span className="product">
            <strong>Jade</strong>
            <span>An AI delivery team for enterprise change</span>
          </span>
        </div>

        {mode === "login" ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submitLogin();
            }}
          >
            <h1 style={{ margin: "0 0 8px" }}>Sign in</h1>
            {notice && <div className="callout" role="status">{notice}</div>}
            <div className="field">
              <label htmlFor="loginEmail">Email</label>
              <input
                id="loginEmail" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div className="field">
              <label htmlFor="loginPassword">Password</label>
              <input
                id="loginPassword" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required
              />
            </div>
            {error && (
              <div className="callout" style={{ borderColor: "var(--stop)" }}>
                {error}
              </div>
            )}
            <div className="btnrow">
              <button className="btn primary" type="submit" disabled={submitting || !email.trim() || !password}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </div>
            <button
              type="button" className="linklike"
              onClick={() => { setMode("forgot"); setError(null); }}
            >
              Forgot password?
            </button>
            <span className="hint">
              New here? You need an invitation from your company's Admin — this is an invite-only prototype.
            </span>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submitForgot();
            }}
          >
            <h1 style={{ margin: "0 0 8px" }}>Reset your password</h1>
            <div className="field">
              <label htmlFor="forgotEmail">Email</label>
              <input
                id="forgotEmail" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            {error && (
              <div className="callout" style={{ borderColor: "var(--stop)" }}>
                {error}
              </div>
            )}
            {forgotSent && <div className="callout">{forgotSent}</div>}
            <div className="btnrow">
              <button className="btn primary" type="submit" disabled={submitting || !email.trim()}>
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </div>
            <button
              type="button" className="linklike"
              onClick={() => { setMode("login"); setError(null); setForgotSent(null); }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
