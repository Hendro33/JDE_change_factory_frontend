import { useEffect, useState } from "react";
import { IS_MOCK_MODE } from "../services/api";
import { request } from "../services/httpApi";
import { saveErrorMessage } from "../services/saveErrors";

/**
 * Shown only to the temporary setup account (admin@e2e.local in the local
 * launcher): create your own administrator account, after which the setup
 * account is switched off and signed out. The password is typed here, on
 * this machine, and goes only to Jade's backend.
 */
export function SetupHandover({ onDone }: { onDone: (email: string) => void }) {
  const [status, setStatus] = useState<{ isSetupAccount: boolean; minPasswordLength: number } | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_MOCK_MODE) return;
    request<{ isSetupAccount: boolean; minPasswordLength: number }>("/auth/setup-handover").then(setStatus).catch(() => setStatus(null));
  }, []);
  if (!status?.isSetupAccount) return null;
  const min = status.minPasswordLength;
  const problem = !email.includes("@") ? "Enter your email address."
    : pw.length < min ? `The password needs at least ${min} characters.`
    : pw !== pw2 ? "The two passwords are not the same." : null;

  async function finish() {
    setBusy(true); setError(null);
    try {
      await request("/auth/setup-handover", { method: "POST", body: { email, displayName: name, password: pw } });
      setPw(""); setPw2("");
      onDone(email);
    } catch (e) {
      setError(saveErrorMessage(e, "Setup could not be finished."));
      setBusy(false);
    }
  }

  return (
    <div className="callout" role="region" aria-label="Finish setup" style={{ borderColor: "var(--warn)", marginBottom: 12 }}>
      <strong>Finish setup: create your own administrator account.</strong> You are signed in with the temporary setup account.
      Create your own account below; it becomes Admin of every customer this setup account manages. The setup account is then
      switched off and cannot sign in again.
      <div className="grid halves" style={{ marginTop: 8 }}>
        <label className="field">Your email<input aria-label="Your email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Your name<input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Choose a password (at least {min} characters)<input aria-label="Choose a password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label className="field">Repeat the password<input aria-label="Repeat the password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>
      {problem && (email || pw || pw2) && <div className="hint">{problem}</div>}
      {error && <div className="hint" role="alert" style={{ color: "var(--stop)" }}>{error}</div>}
      <div className="btnrow" style={{ marginTop: 6 }}>
        <button className="btn primary" disabled={busy || !!problem} onClick={finish}>Create my account and switch off the setup account</button>
      </div>
    </div>
  );
}
