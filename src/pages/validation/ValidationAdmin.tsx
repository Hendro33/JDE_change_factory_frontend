import { useEffect, useState } from "react";
import { Link } from "../../router";
import { useSessionInfo } from "../../components/design";
import {
  validationRequest as req,
  errorText,
  type RecordData as D,
} from "../../services/validationApi";
import { Field, Select, Check, JsonField, Status } from "./Validation";
import "./Validation.css";
const blank = (): D => ({
  revision: 0,
  name: "",
  stage: "UAT",
  application: "JD Edwards",
  ais_url: "",
  web_url: "",
  browser_environment_selector: "",
  browser_role_selector: "",
  jde_environment: "",
  jde_role: "*ALL",
  username: "",
  password: "",
  ca_pem: "",
  certificate_sha: "",
  enabled: false,
  allow_writes: false,
  side_effects_isolated: false,
  routes: ["manual"],
  allowed_ais_paths: [],
  redaction_selectors: [],
  parameters: {},
  prerequisites: "",
  cleanup: "",
  timeout_seconds: 300,
  max_actions: 80,
  max_agent_calls: 5,
});
const fields = Object.keys(blank());
export function ValidationAdmin() {
  const info = useSessionInfo();
  const [data, setData] = useState<D | null>(null),
    [env, setEnv] = useState<D | null>(null),
    [policy, setPolicy] = useState<D | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function reload() {
    const d = await req("/settings");
    setData(d);
    setPolicy(
      Object.fromEntries(
        Object.keys(d.policy)
          .filter((k) => k !== "company_id")
          .map((k) => [k, d.policy[k]]),
      ),
    );
  }
  useEffect(() => {
    reload().catch((e) => setError(errorText(e)));
  }, [info.session.activeCustomerId]);
  async function act(fn: () => Promise<unknown>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await fn();
      await reload();
      setMessage("Saved");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string, v: any) => setEnv((e) => ({ ...e, [k]: v }));
  if (!data || !policy)
    return (
      <div className="validation">
        {error ? <p role="alert">{error}</p> : <p>Loading settings…</p>}
      </div>
    );
  return (
    <div className="validation">
      <p>
        Configure validation environments, test accounts and release policy
        here. Assign the Test Manager role in{" "}
        <Link to="/admin/organisation/users">Users & roles</Link>. Manage
        instructions, AI models, budgets and knowledge in{" "}
        <Link to="/admin/agents">Agents & AI</Link>.
      </p>
      {error && (
        <div role="alert" className="v-error">
          {error}
        </div>
      )}
      {message && (
        <p role="status" className="v-success">
          {message}
        </p>
      )}
      <div className="v-grid">
        {Object.entries(data.health).map(([k, v]) => (
          <div className="v-card" key={k}>
            {k.replace(/_/g, " ")}
            <br />
            <Status value={v ? "available" : "not_configured"} />
          </div>
        ))}
      </div>
      <p>
        Evidence storage: {data.storage}. Files use the platform’s existing
        durable storage and backups.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={() => act(() => req("/storage/test", {}))}
      >
        Test evidence storage
      </button>
      <p className="v-muted">
        Worker, browser installation and encryption key are platform
        prerequisites. Customer environments, credentials, policies and agents
        are managed here.
      </p>
      {env ? (
        <form
          className="v-card"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await req(
                env.id ? "/environments/" + env.id : "/environments",
                Object.fromEntries(
                  fields.map((k) => [k, env[k] ?? blank()[k]]),
                ),
                env.id ? "PUT" : "POST",
              );
              setEnv(null);
            });
          }}
        >
          <h2>{env.id ? "Edit environment" : "Add environment"}</h2>
          <div className="v-grid">
            <Field
              label="Display name"
              value={env.name}
              onChange={(v) => set("name", v)}
              required
            />
            <Select
              label="Stage"
              value={env.stage}
              onChange={(v) => set("stage", v)}
              options={["DEV", "QA", "UAT", "PREPROD", "PROD"].map((id) => ({
                id,
                name: id,
              }))}
            />
            <Field
              label="Application"
              value={env.application}
              onChange={(v) => set("application", v)}
            />
            <Field
              label="JDE environment identity"
              value={env.jde_environment}
              onChange={(v) => set("jde_environment", v)}
              required
            />
            <Field
              label="JDE role"
              value={env.jde_role}
              onChange={(v) => set("jde_role", v)}
            />
          </div>
          <Check
            label="Environment enabled for validation"
            checked={env.enabled}
            onChange={(v) => set("enabled", v)}
          />
          <h3>Allowed execution routes</h3>
          {["manual", "browser", "computer_use", "ais"].map((route) => (
            <Check
              key={route}
              label={
                {
                  manual: "Manual UAT",
                  browser: "Browser automation",
                  computer_use: "Agent-assisted browser",
                  ais: "AIS service",
                }[route]!
              }
              checked={env.routes.includes(route)}
              onChange={(v) =>
                set(
                  "routes",
                  v
                    ? [...env.routes, route]
                    : env.routes.filter((r: string) => r !== route),
                )
              }
            />
          ))}
          <details open={env.routes.some((r: string) => r !== "manual")}>
            <summary>ERP connection and dedicated test account</summary>
            <Field
              label="AIS HTTPS base URL"
              value={env.ais_url}
              onChange={(v) => set("ais_url", v)}
            />
            <Field
              label="JDE browser HTTPS URL"
              value={env.web_url}
              onChange={(v) => set("web_url", v)}
            />
            <Field
              label="Browser environment identity selector"
              value={env.browser_environment_selector}
              onChange={(v) => set("browser_environment_selector", v)}
            />
            <Field
              label="Browser role identity selector"
              value={env.browser_role_selector}
              onChange={(v) => set("browser_role_selector", v)}
            />
            <p className="v-muted">
              For browser runs, these controls must uniquely display the
              configured environment and role after login. An unverified session
              is blocked.
            </p>
            <Field
              label="Test username"
              value={env.username}
              onChange={(v) => set("username", v)}
            />
            <Field
              label={
                env.credential_set
                  ? "Replacement password (blank keeps stored credential)"
                  : "Test password"
              }
              type="password"
              value={env.password}
              onChange={(v) => set("password", v)}
            />
            <Field
              label="Trusted CA certificate (PEM; blank keeps saved certificate)"
              value={env.ca_pem}
              onChange={(v) => set("ca_pem", v)}
              multiline
            />
            {env.certificate_sha && (
              <p className="v-muted">
                Saved certificate fingerprint: {env.certificate_sha}
              </p>
            )}
            <Field
              label="Allowed AIS paths (one exact path per line)"
              value={env.allowed_ais_paths.join("\n")}
              onChange={(v) =>
                set("allowed_ais_paths", v.split("\n").filter(Boolean))
              }
              multiline
            />
            <Field
              label="Sensitive browser fields to mask (CSS selectors, one per line)"
              value={env.redaction_selectors.join("\n")}
              onChange={(v) =>
                set("redaction_selectors", v.split("\n").filter(Boolean))
              }
              multiline
            />
          </details>
          <h3>Transaction controls and test data</h3>
          <Check
            label="Allow actions that may change data"
            checked={env.allow_writes}
            onChange={(v) => set("allow_writes", v)}
          />
          <Check
            label="Downstream effects are isolated or explicitly controlled"
            checked={env.side_effects_isolated}
            onChange={(v) => set("side_effects_isolated", v)}
          />
          <p className="v-muted">
            Browser clicks, field entry and AIS POSTs may commit transactions.
            Both controls are required for those actions. Production also
            requires policy enablement and a time-limited Application Manager
            authorisation for the exact build.
          </p>
          <Field
            label="Test data and prerequisite instructions"
            value={env.prerequisites}
            onChange={(v) => set("prerequisites", v)}
            multiline
          />
          <Field
            label="Cleanup and rollback instructions"
            value={env.cleanup}
            onChange={(v) => set("cleanup", v)}
            multiline
          />
          <JsonField
            label="Non-secret test data parameters (referenced as ${name} in steps)"
            value={env.parameters}
            onChange={(v) => set("parameters", v)}
          />
          <div className="v-grid">
            <Field
              label="Run timeout in seconds (30–1800)"
              type="number"
              value={env.timeout_seconds}
              onChange={(v) => set("timeout_seconds", Number(v))}
            />
            <Field
              label="Maximum browser actions (1–200)"
              type="number"
              value={env.max_actions}
              onChange={(v) => set("max_actions", Number(v))}
            />
          </div>
          <Field
            label="Maximum agent-assisted control selections per run (1–50)"
            type="number"
            value={env.max_agent_calls}
            onChange={(v) => set("max_agent_calls", Number(v))}
          />
          <div className="v-actions">
            <button className="btn primary" disabled={busy}>
              Save environment
            </button>
            <button type="button" className="btn" onClick={() => setEnv(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="v-actions">
            <button className="btn primary" onClick={() => setEnv(blank())}>
              Add environment
            </button>
          </div>
          {data.environments.map((e: D) => (
            <div className="v-card" key={e.id}>
              <h2>
                {e.name} · {e.stage}
              </h2>
              <Status value={e.enabled ? "enabled" : "disabled"} />
              <p>
                {e.jde_environment} · {e.routes.join(", ")}
              </p>
              <p>Connection: {e.connection_test?.status ?? "Not tested"}</p>
              <div className="v-actions">
                <button
                  className="btn"
                  onClick={() =>
                    setEnv({ ...blank(), ...e, password: "", ca_pem: "" })
                  }
                >
                  Edit
                </button>
                <button
                  className="btn"
                  disabled={busy || !e.ais_url}
                  onClick={() =>
                    act(() =>
                      req("/environments/" + e.id + "/test", {
                        revision: e.revision,
                        note: "",
                      }),
                    )
                  }
                >
                  Test saved AIS connection
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      <form
        className="v-card"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => req("/policy", policy, "PUT"));
        }}
      >
        <h2>Validation policy</h2>
        <div className="v-grid">
          <Field
            label="Result freshness in days"
            type="number"
            value={policy.freshness_days}
            onChange={(v) =>
              setPolicy({ ...policy, freshness_days: Number(v) })
            }
          />
          <Field
            label="Minimum evidence retention in days"
            type="number"
            value={policy.evidence_days}
            onChange={(v) => setPolicy({ ...policy, evidence_days: Number(v) })}
          />
        </div>
        {[
          [
            "require_independent_review",
            "Require an independent Test Manager for approvals and reviews",
          ],
          [
            "allow_release_exceptions",
            "Allow documented Application Manager release exceptions",
          ],
          [
            "production_enabled",
            "Enable explicitly authorised production smoke tests",
          ],
          [
            "jira_enabled",
            "Enable validation defect sync with the configured Jira project",
          ],
        ].map(([k, label]) => (
          <Check
            key={k}
            label={label}
            checked={policy[k]}
            onChange={(v) => setPolicy({ ...policy, [k]: v })}
          />
        ))}
        <Field
          label="Jira defect issue type"
          value={policy.jira_issue_type}
          onChange={(v) => setPolicy({ ...policy, jira_issue_type: v })}
        />
        <Field
          label="Customer validation instructions for agents"
          value={policy.instructions}
          onChange={(v) => setPolicy({ ...policy, instructions: v })}
          multiline
        />
        <button className="btn primary" disabled={busy}>
          Save policy
        </button>
      </form>
    </div>
  );
}
