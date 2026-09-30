import { useEffect, useState, type ReactNode } from "react";
import { PageHeader, useSessionInfo } from "../../components/design";
import { Link, useLocation } from "../../router";
import {
  validationRequest as req,
  validationEvidence,
  validationReport,
  validationStart,
  latest,
  errorText,
  type RecordData as D,
} from "../../services/validationApi";
import "./Validation.css";

export const Status = ({ value }: { value: string }) => (
  <span className={"v-status " + value}>{value.replace(/_/g, " ")}</span>
);
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  required = false,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      )}
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="v-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
const names = (items: D[], fn: (r: D) => string) =>
  items.map((r) => ({ id: r.id, name: fn(r) }));
const blankStep = (n: number): D => ({
  id: "step-" + n,
  action: "",
  expected: "",
  operation: "manual",
  target: "",
  value: "",
  path: "",
  method: "POST",
  body: {},
  assertion: "human",
  expected_value: null,
  result_path: "",
  mutates: false,
  wait_seconds: 0,
});
const blankScenario = (): D => ({
  title: "",
  purpose: "",
  story_id: "",
  criteria: [],
  process_refs: [],
  domain_id: "",
  tags: [],
  prerequisites: "",
  cleanup: "",
  route: "manual",
  risk: "medium",
  mandatory: true,
  steps: [blankStep(1)],
});

export function ValidationWorkspace({
  releaseOnly = false,
}: {
  releaseOnly?: boolean;
}) {
  const info = useSessionInfo();
  const tasksOnly = useLocation().path === "/validation/tasks";
  const permitted =
    !tasksOnly && info.has("test_manager", "product_manager", "admin");
  const [tab, setTab] = useState(releaseOnly ? "release" : "dashboard");
  const [data, setData] = useState<D | null>(null),
    [sources, setSources] = useState<D[]>([]),
    [members, setMembers] = useState<D[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [editScenario, setEditScenario] = useState<D | null>(null),
    [editPlan, setEditPlan] = useState<D | null>(null),
    [selectedRun, setSelectedRun] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    environment: "",
    application: "",
    owner: "",
    from: "",
    to: "",
  });
  const filter = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const visibleSummaries = (data?.summaries ?? []).filter((summary: D) => {
    const plan = data?.plans.find((p: D) => p.id === summary.plan_id);
    const version = latest(plan);
    const haystack = JSON.stringify([
      version.body.title,
      version.body.story_ids,
      version.scenarios.map((s: D) => [
        s.body.title,
        s.body.process_refs,
        s.body.domain_id,
        s.body.tags,
      ]),
      sources
        .filter((s) => version.body.story_ids.includes(s.id))
        .map((s) => s.material.business_domain_id),
    ]).toLowerCase();
    const created = version.created_at.slice(0, 10);
    return (
      (!filters.search || haystack.includes(filters.search.toLowerCase())) &&
      (!filters.environment ||
        version.body.environment_ids.includes(filters.environment)) &&
      (!filters.application ||
        data?.environments.some(
          (e: D) =>
            version.body.environment_ids.includes(e.id) &&
            e.application === filters.application,
        )) &&
      (!filters.owner ||
        (version.body.owner_id || version.created_by) === filters.owner) &&
      (!filters.from || created >= filters.from) &&
      (!filters.to || created <= filters.to)
    );
  });
  const visiblePlanIds = new Set(visibleSummaries.map((s: D) => s.plan_id));
  async function reload() {
    if (!permitted) {
      setData({ tasks: await req<D[]>("/tasks") });
      return;
    }
    const [d, s, m] = await Promise.all([
      req(),
      req<D[]>("/sources"),
      req<D[]>("/members"),
    ]);
    setData(d);
    setSources(s);
    setMembers(m);
  }
  useEffect(() => {
    let live = true;
    reload().catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [info.session.activeCustomerId, tasksOnly]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        reload().catch((e) => setError(errorText(e)));
    }, 8000);
    return () => clearInterval(timer);
  }, [info.session.activeCustomerId, tasksOnly]);
  async function action(fn: () => Promise<unknown>, message = "Saved") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      setNotice(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const manage = info.has("test_manager");
  const run = data?.runs?.find((r: D) => r.id === selectedRun);
  const content = (): ReactNode => {
    if (!data) return <p>Loading validation…</p>;
    if (!permitted)
      return (
        <>
          <p>Only your assigned acceptance tests are shown here.</p>
          {data.tasks.map((r: D) => (
            <RunCard
              key={r.id}
              run={r}
              manage={false}
              busy={busy}
              action={action}
              userId={info.session.userId}
            />
          ))}
          {!data.tasks.length && (
            <p>No acceptance tests are assigned to you.</p>
          )}
        </>
      );
    if (editScenario)
      return (
        <ScenarioEditor
          record={editScenario}
          sources={sources}
          busy={busy}
          cancel={() => setEditScenario(null)}
          save={(body) =>
            action(async () => {
              await req(
                editScenario.id
                  ? "/scenarios/" + editScenario.id
                  : "/scenarios",
                body,
                editScenario.id ? "PUT" : "POST",
              );
              setEditScenario(null);
            }, "Draft version saved")
          }
        />
      );
    if (editPlan)
      return (
        <PlanEditor
          record={editPlan}
          data={data}
          sources={sources}
          busy={busy}
          cancel={() => setEditPlan(null)}
          save={(body) =>
            action(async () => {
              await req(
                editPlan.id ? "/plans/" + editPlan.id : "/plans",
                body,
                editPlan.id ? "PUT" : "POST",
              );
              setEditPlan(null);
            }, "Draft plan saved")
          }
        />
      );
    if (tab === "library")
      return (
        <>
          <div className="v-actions">
            {manage && (
              <button
                className="btn primary"
                onClick={() => setEditScenario({})}
              >
                Create scenario
              </button>
            )}
            <button
              className="btn"
              onClick={() =>
                exportJson("jade-test-library.json", data.scenarios)
              }
            >
              Export library
            </button>
            {manage && (
              <label>
                Import scenario
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      action(async () => {
                        const value = JSON.parse(await f.text());
                        await req("/scenarios", { ...value, revision: 0 });
                      }, "Imported as a draft");
                  }}
                />
              </label>
            )}
          </div>
          <p className="v-muted">
            Reusable scenarios retain every approved version. Imports use a
            scenario body from an exported version and are always drafts.
          </p>
          {data.scenarios.map((r: D) => {
            const v = latest(r);
            return (
              <article className="v-card" key={r.id}>
                <h2>{v.body.title}</h2>
                <Status value={r.retired ? "retired" : v.status} />{" "}
                <span>
                  Version {v.version} · {v.body.route} · {v.body.risk} risk
                </span>
                <p>{v.body.purpose}</p>
                <details>
                  <summary>Steps and version history</summary>
                  {r.versions.map((x: D) => (
                    <div key={x.version}>
                      <h3>
                        Version {x.version} — {x.status}
                      </h3>
                      {x.body.steps.map((step: D) => (
                        <p key={step.id}>
                          <b>{step.action}</b> — Expect: {step.expected}
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
                {manage && (
                  <div className="v-actions">
                    <button className="btn" onClick={() => setEditScenario(r)}>
                      Create new draft version
                    </button>
                    {v.status === "draft" && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          action(
                            () =>
                              req("/scenarios/" + r.id + "/approve", {
                                revision: r.revision,
                                note: "Reviewed scenario and expected outcomes",
                              }),
                            "Scenario approved",
                          )
                        }
                      >
                        Approve version
                      </button>
                    )}
                    {!r.retired && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          action(() =>
                            req("/scenarios/" + r.id + "/retire", {
                              revision: r.revision,
                              note: "Retired from selection",
                            }),
                          )
                        }
                      >
                        Retire
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!data.scenarios.length && (
            <p>
              No scenarios yet. Create one or ask the Test Design Agent to
              propose tests from a story.
            </p>
          )}
        </>
      );
    if (tab === "plans")
      return (
        <>
          <div className="v-actions">
            {manage && (
              <button className="btn primary" onClick={() => setEditPlan({})}>
                Create plan
              </button>
            )}
          </div>
          {data.plans.map((p: D) => (
            <PlanCard
              key={p.id}
              plan={p}
              data={data}
              members={members}
              manage={manage}
              busy={busy}
              action={action}
              edit={() => setEditPlan(p)}
              openRun={(id) => {
                setSelectedRun(id);
                setTab("runs");
              }}
            />
          ))}
        </>
      );
    if (tab === "runs")
      return (
        <>
          {run && (
            <button className="btn" onClick={() => setSelectedRun("")}>
              All runs
            </button>
          )}
          {(run ? [run] : data.runs).map((r: D) => (
            <RunCard
              key={r.id}
              run={r}
              manage={manage}
              busy={busy}
              action={action}
              userId={info.session.userId}
            />
          ))}
          {!data.runs.length && (
            <p>
              No execution runs. Approve a plan and record its deployment before
              running it.
            </p>
          )}
        </>
      );
    if (tab === "defects")
      return data.defects.length ? (
        data.defects.map((d: D) => (
          <DefectCard
            key={d.id}
            defect={d}
            manage={manage}
            busy={busy}
            action={action}
          />
        ))
      ) : (
        <p>No validation defects recorded.</p>
      );
    if (tab === "agents")
      return (
        <Agents
          data={data}
          sources={sources}
          busy={busy}
          manage={manage}
          action={action}
        />
      );
    if (tab === "release")
      return (
        <ReleasePanel
          data={data}
          sources={sources}
          allowed={info.has("product_manager")}
          busy={busy}
          action={action}
        />
      );
    return (
      <>
        <details>
          <summary>Filter validation plans</summary>
          <div className="v-grid">
            <Field
              label="Plan, story, business domain or process"
              value={filters.search}
              onChange={(v) => filter("search", v)}
            />
            <Select
              label="Filter environment"
              value={filters.environment}
              onChange={(v) => filter("environment", v)}
              options={names(data.environments, (e) => e.name)}
            />
            <Select
              label="Filter application"
              value={filters.application}
              onChange={(v) => filter("application", v)}
              options={Array.from(
                new Set<string>(data.environments.map((e: D) => e.application)),
              ).map((id) => ({ id, name: id }))}
            />
            <Select
              label="Plan owner / creator"
              value={filters.owner}
              onChange={(v) => filter("owner", v)}
              options={members.map((m) => ({ id: m.id, name: m.name }))}
            />
            <Field
              label="Plan version created from"
              type="date"
              value={filters.from}
              onChange={(v) => filter("from", v)}
            />
            <Field
              label="Plan version created to"
              type="date"
              value={filters.to}
              onChange={(v) => filter("to", v)}
            />
          </div>
          <button
            className="btn"
            onClick={() =>
              setFilters({
                search: "",
                environment: "",
                application: "",
                owner: "",
                from: "",
                to: "",
              })
            }
          >
            Clear filters
          </button>
        </details>
        <div className="v-metrics">
          {[
            ["Plans", visibleSummaries.length],
            [
              "Ready for sign-off",
              visibleSummaries.filter(
                (s: D) => s.outcome === "passed" && !s.signoff_current,
              ).length,
            ],
            [
              "Open defects",
              data.defects.filter(
                (d: D) =>
                  visiblePlanIds.has(d.plan_id) && d.status !== "closed",
              ).length,
            ],
            [
              "Active runs",
              data.runs.filter(
                (r: D) =>
                  visiblePlanIds.has(r.plan_id) &&
                  [
                    "queued",
                    "preflight",
                    "running",
                    "awaiting_input",
                    "stop_requested",
                  ].includes(r.status),
              ).length,
            ],
          ].map(([label, value]) => (
            <div className="v-card" key={label}>
              <strong>{value}</strong>
              {label}
            </div>
          ))}
        </div>
        {!data.plans.length && (
          <div className="v-card">
            <h2>Set up your first validation</h2>
            <p>
              An administrator configures the test environments and assigns Test
              Managers. Create and approve reusable scenarios, assemble a plan,
              then validate an Application Manager’s recorded deployment.
            </p>
            {info.admin && (
              <Link to="/admin/validation">Configure validation</Link>
            )}
          </div>
        )}
        {visibleSummaries.map((sum: D) => (
          <SummaryCard
            key={sum.plan_id}
            sum={sum}
            manage={manage}
            busy={busy}
            action={action}
          />
        ))}
        <div className="v-actions">
          <button
            className="btn"
            onClick={() =>
              action(
                async () =>
                  exportJson("jade-validation-audit.json", await req("/audit")),
                "Audit exported",
              )
            }
          >
            Export audit trail
          </button>
          <Link to="/am/validation">Application Manager release handoff</Link>
        </div>
      </>
    );
  };
  return (
    <div className="validation">
      <PageHeader
        title={releaseOnly ? "Validation & release handoff" : "Validation"}
        subtitle={
          releaseOnly
            ? "Confirm deployments and make release decisions using reviewed test evidence."
            : "Plan tests, collect evidence and provide a clear testing conclusion."
        }
      />
      {permitted && !releaseOnly && (
        <nav className="v-nav" aria-label="Validation sections">
          {["dashboard", "library", "plans", "runs", "defects", "agents"].map(
            (t) => (
              <button
                className="btn"
                key={t}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => {
                  setTab(t);
                  window.scrollTo({ top: 0 });
                  setEditScenario(null);
                  setEditPlan(null);
                }}
              >
                {
                  {
                    dashboard: "Dashboard",
                    library: "Test Library",
                    plans: "Plans",
                    runs: "Runs & UAT",
                    defects: "Defects",
                    agents: "Agents",
                  }[t]
                }
              </button>
            ),
          )}
        </nav>
      )}
      {error && (
        <div className="v-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="v-success" role="status">
          {notice}
        </div>
      )}
      {content()}
    </div>
  );
}

function exportJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
type Action = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
function ScenarioEditor({
  record,
  sources,
  busy,
  cancel,
  save,
}: {
  record: D;
  sources: D[];
  busy: boolean;
  cancel: () => void;
  save: (body: D) => void;
}) {
  const [body, setBody] = useState<D>(() =>
    record.id ? structuredClone(latest(record).body) : blankScenario(),
  );
  const set = (key: string, value: any) =>
    setBody((b) => ({ ...b, [key]: value }));
  const step = (i: number, key: string, value: any) =>
    set(
      "steps",
      body.steps.map((s: D, n: number) =>
        n === i ? { ...s, [key]: value } : s,
      ),
    );
  const src = sources.find((s) => s.id === body.story_id);
  return (
    <form
      className="v-card"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...body, revision: record.revision ?? 0 });
      }}
    >
      <h2>{record.id ? "New scenario version" : "Create scenario"}</h2>
      <Field
        label="Title"
        value={body.title}
        onChange={(v) => set("title", v)}
        required
      />
      <Field
        label="Purpose"
        value={body.purpose}
        onChange={(v) => set("purpose", v)}
        multiline
      />
      <Select
        label="Source story"
        value={body.story_id}
        options={names(sources, (s) => s.title)}
        onChange={(v) => {
          set("story_id", v);
          set("criteria", []);
        }}
      />
      {src?.material.user_story.acceptance_criteria.map((c: D) => (
        <Check
          key={c.id}
          label={c.text}
          checked={body.criteria.includes(c.id)}
          onChange={(v) =>
            set(
              "criteria",
              v
                ? [...body.criteria, c.id]
                : body.criteria.filter((x: string) => x !== c.id),
            )
          }
        />
      ))}
      <div className="v-grid">
        <Select
          label="Execution route"
          value={body.route}
          options={["manual", "browser", "computer_use", "ais"].map((id) => ({
            id,
            name: {
              manual: "Manual UAT",
              browser: "Browser automation",
              computer_use: "Agent-assisted browser",
              ais: "AIS service",
            }[id]!,
          }))}
          onChange={(v) => {
            set("route", v);
            set(
              "steps",
              body.steps.map((s: D) => ({
                ...s,
                operation:
                  v === "manual" ? "manual" : v === "ais" ? "ais" : "observe",
              })),
            );
          }}
        />
        <Select
          label="Risk"
          value={body.risk}
          options={["low", "medium", "high"].map((id) => ({ id, name: id }))}
          onChange={(v) => set("risk", v)}
        />
      </div>
      <Field
        label="Prerequisites and test data"
        value={body.prerequisites}
        onChange={(v) => set("prerequisites", v)}
        multiline
      />
      <Field
        label="Cleanup and rollback"
        value={body.cleanup}
        onChange={(v) => set("cleanup", v)}
        multiline
      />
      <Field
        label="Tags (comma separated)"
        value={body.tags.join(", ")}
        onChange={(v) =>
          set(
            "tags",
            v
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
      />
      <Field
        label="Business process references (comma separated)"
        value={body.process_refs.join(", ")}
        onChange={(v) =>
          set(
            "process_refs",
            v
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
      />
      {body.steps.map((s: D, i: number) => (
        <div className="v-step" key={s.id}>
          <h3>Step {i + 1}</h3>
          <Field
            label="Action"
            value={s.action}
            onChange={(v) => step(i, "action", v)}
            required
          />
          <Field
            label="Expected business result"
            value={s.expected}
            onChange={(v) => step(i, "expected", v)}
            required
          />
          {body.route !== "manual" && (
            <details open>
              <summary>Execution binding</summary>
              {body.route !== "ais" && (
                <Select
                  label="Operation"
                  value={s.operation}
                  options={[
                    "open",
                    "click",
                    "fill",
                    "select",
                    "press",
                    "observe",
                  ].map((id) => ({ id, name: id }))}
                  onChange={(v) => step(i, "operation", v)}
                />
              )}
              <Field
                label={
                  body.route === "ais"
                    ? "Exact AIS path"
                    : "Target label or relative page path"
                }
                value={body.route === "ais" ? s.path : s.target}
                onChange={(v) =>
                  step(i, body.route === "ais" ? "path" : "target", v)
                }
              />
              {body.route === "ais" ? (
                <>
                  <Select
                    label="HTTP method"
                    value={s.method}
                    options={["GET", "POST"].map((id) => ({ id, name: id }))}
                    onChange={(v) => step(i, "method", v)}
                  />
                  <JsonField
                    label="AIS request body"
                    value={s.body}
                    onChange={(v) => step(i, "body", v)}
                  />
                  <Field
                    label="Result property path (e.g. data.total)"
                    value={s.result_path}
                    onChange={(v) => step(i, "result_path", v)}
                  />
                </>
              ) : (
                <Field
                  label="Input value or key"
                  value={s.value}
                  onChange={(v) => step(i, "value", v)}
                />
              )}
              <Select
                label="Verification"
                value={s.assertion}
                options={[
                  { id: "human", name: "Human evidence assessment" },
                  { id: "contains", name: "Contains text" },
                  { id: "equals", name: "Equals value" },
                  { id: "exists", name: "Value exists" },
                ]}
                onChange={(v) => step(i, "assertion", v)}
              />
              <Select
                label="Expected value type"
                value={
                  typeof s.expected_value === "number"
                    ? "number"
                    : typeof s.expected_value === "boolean"
                      ? "boolean"
                      : "string"
                }
                options={[
                  { id: "string", name: "Text" },
                  { id: "number", name: "Number" },
                  { id: "boolean", name: "True / false" },
                ]}
                onChange={(v) =>
                  step(
                    i,
                    "expected_value",
                    v === "number" ? 0 : v === "boolean" ? true : "",
                  )
                }
              />
              <Field
                label="Expected value"
                value={
                  s.expected_value === null ? "" : String(s.expected_value)
                }
                onChange={(v) =>
                  step(
                    i,
                    "expected_value",
                    typeof s.expected_value === "number"
                      ? Number(v)
                      : typeof s.expected_value === "boolean"
                        ? v.toLowerCase() === "true"
                        : v,
                  )
                }
              />
              <Check
                label="This step changes data"
                checked={s.mutates}
                onChange={(v) => step(i, "mutates", v)}
              />
            </details>
          )}
          {body.steps.length > 1 && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                set(
                  "steps",
                  body.steps.filter((_: D, n: number) => n !== i),
                )
              }
            >
              Remove step
            </button>
          )}
        </div>
      ))}
      <div className="v-actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            set("steps", [
              ...body.steps,
              {
                ...blankStep(Date.now()),
                operation:
                  body.route === "manual"
                    ? "manual"
                    : body.route === "ais"
                      ? "ais"
                      : "observe",
              },
            ])
          }
        >
          Add step
        </button>
        <button className="btn primary" disabled={busy}>
          Save draft
        </button>
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
export function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return (
    <label>
      {label}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            e.target.setCustomValidity("");
          } catch {
            e.target.setCustomValidity("Enter valid JSON");
          }
        }}
      />
    </label>
  );
}
function PlanEditor({
  record,
  data,
  sources,
  busy,
  cancel,
  save,
}: {
  record: D;
  data: D;
  sources: D[];
  busy: boolean;
  cancel: () => void;
  save: (body: D) => void;
}) {
  const [body, setBody] = useState<D>(() =>
    record.id
      ? structuredClone(latest(record).body)
      : {
          title: "",
          story_ids: [],
          environment_ids: [],
          selections: [],
          exclusions: "",
          uncovered_criteria_reason: "",
          owner_id: "",
        },
  );
  const set = (k: string, v: any) => setBody((b) => ({ ...b, [k]: v }));
  const toggle = (k: string, id: string, v: boolean) =>
    set(k, v ? [...body[k], id] : body[k].filter((x: string) => x !== id));
  return (
    <form
      className="v-card"
      onSubmit={(e) => {
        e.preventDefault();
        save({ ...body, revision: record.revision ?? 0 });
      }}
    >
      <h2>{record.id ? "New plan version" : "Create validation plan"}</h2>
      <Field
        label="Plan title"
        value={body.title}
        onChange={(v) => set("title", v)}
        required
      />
      <h3>Stories in the implemented change set</h3>
      {sources.map((r) => (
        <Check
          key={r.id}
          label={r.title}
          checked={body.story_ids.includes(r.id)}
          onChange={(v) => toggle("story_ids", r.id, v)}
        />
      ))}
      <h3>Environments</h3>
      {data.environments.map((r: D) => (
        <Check
          key={r.id}
          label={r.name + " · " + r.stage + (r.enabled ? "" : " · disabled")}
          checked={body.environment_ids.includes(r.id)}
          onChange={(v) => toggle("environment_ids", r.id, v)}
        />
      ))}
      <h3>Approved scenarios</h3>
      {data.scenarios
        .filter((r: D) => !r.retired)
        .map((r: D) => {
          const approved = r.versions.filter((v: D) => v.status === "approved");
          const selection = body.selections.find(
            (s: D) => s.scenario_id === r.id,
          );
          return approved.length ? (
            <div key={r.id}>
              <Check
                label={latest(r).body.title}
                checked={!!selection}
                onChange={(v) =>
                  set(
                    "selections",
                    v
                      ? [
                          ...body.selections,
                          {
                            scenario_id: r.id,
                            version: approved[approved.length - 1].version,
                            mandatory: true,
                            rationale: "",
                            depends_on: [],
                          },
                        ]
                      : body.selections.filter(
                          (s: D) => s.scenario_id !== r.id,
                        ),
                  )
                }
              />
              {selection && (
                <div className="v-step">
                  <Select
                    label="Pinned version"
                    value={String(selection.version)}
                    options={approved.map((v: D) => ({
                      id: String(v.version),
                      name: "Version " + v.version,
                    }))}
                    onChange={(v) =>
                      set(
                        "selections",
                        body.selections.map((s: D) =>
                          s === selection ? { ...s, version: Number(v) } : s,
                        ),
                      )
                    }
                  />
                  <Check
                    label="Mandatory for sign-off"
                    checked={selection.mandatory}
                    onChange={(v) =>
                      set(
                        "selections",
                        body.selections.map((s: D) =>
                          s === selection ? { ...s, mandatory: v } : s,
                        ),
                      )
                    }
                  />
                  <Field
                    label="Selection rationale"
                    value={selection.rationale}
                    onChange={(v) =>
                      set(
                        "selections",
                        body.selections.map((s: D) =>
                          s === selection ? { ...s, rationale: v } : s,
                        ),
                      )
                    }
                  />
                  {body.selections
                    .slice(0, body.selections.indexOf(selection))
                    .map((prior: D) => (
                      <Check
                        key={prior.scenario_id}
                        label={
                          "Depends on " +
                          latest(
                            data.scenarios.find(
                              (r: D) => r.id === prior.scenario_id,
                            ),
                          ).body.title
                        }
                        checked={selection.depends_on.includes(
                          prior.scenario_id,
                        )}
                        onChange={(v) =>
                          set(
                            "selections",
                            body.selections.map((s: D) =>
                              s === selection
                                ? {
                                    ...s,
                                    depends_on: v
                                      ? [...s.depends_on, prior.scenario_id]
                                      : s.depends_on.filter(
                                          (id: string) =>
                                            id !== prior.scenario_id,
                                        ),
                                  }
                                : s,
                            ),
                          )
                        }
                      />
                    ))}
                </div>
              )}
            </div>
          ) : null;
        })}
      <Field
        label="Scope exclusions"
        value={body.exclusions}
        onChange={(v) => set("exclusions", v)}
        multiline
      />
      <Field
        label="Reason for any uncovered acceptance criteria"
        value={body.uncovered_criteria_reason}
        onChange={(v) => set("uncovered_criteria_reason", v)}
        multiline
      />
      <div className="v-actions">
        <button className="btn primary" disabled={busy}>
          Save draft
        </button>
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function PlanCard({
  plan,
  data,
  members,
  manage,
  busy,
  action,
  edit,
  openRun,
}: {
  plan: D;
  data: D;
  members: D[];
  manage: boolean;
  busy: boolean;
  action: Action;
  edit: () => void;
  openRun: (id: string) => void;
}) {
  const v = latest(plan),
    [env, setEnv] = useState(""),
    [assignee, setAssignee] = useState(""),
    [approval, setApproval] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const deps = data.deployments
    .filter(
      (d: D) =>
        d.environment_id === env &&
        d.story_ids.length === v.body.story_ids.length &&
        d.story_ids.every((id: string) => v.body.story_ids.includes(id)),
    )
    .sort((a: D, b: D) => b.at.localeCompare(a.at));
  const dep = deps[0];
  return (
    <article className="v-card">
      <h2>{v.body.title}</h2>
      <Status value={v.status} />{" "}
      <span>
        Version {v.version} · {v.scenarios.length} scenarios
      </span>
      <details>
        <summary>Scope and pinned versions</summary>
        {v.scenarios.map((s: D) => (
          <p key={s.scenario_id}>
            {s.body.title} · v{s.version} ·{" "}
            {s.mandatory ? "mandatory" : "optional"}
          </p>
        ))}
        <p>{v.body.exclusions}</p>
        <p>{v.body.uncovered_criteria_reason}</p>
      </details>
      {manage && (
        <>
          <div className="v-actions">
            <button className="btn" onClick={edit}>
              New draft version
            </button>
            {v.status === "draft" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(
                    () =>
                      req("/plans/" + plan.id + "/approve", {
                        revision: plan.revision,
                        note: "Reviewed scope, scenarios and exclusions",
                      }),
                    "Plan approved",
                  )
                }
              >
                Approve plan
              </button>
            )}
          </div>
          {v.status === "approved" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  const run = await validationStart({
                    plan_id: plan.id,
                    version: v.version,
                    environment_id: env,
                    deployment_id: dep?.id ?? "",
                    idempotency_key: crypto.randomUUID(),
                    assignee_id: assignee,
                    selected,
                    production_approval_id: approval,
                  });
                  openRun(run.id);
                }, "Run queued");
              }}
            >
              <details>
                <summary>Choose scenarios (all by default)</summary>
                {v.scenarios.map((s: D) => (
                  <Check
                    key={s.scenario_id}
                    label={s.body.title}
                    checked={selected.includes(s.scenario_id)}
                    onChange={(value) =>
                      setSelected((ids) =>
                        value
                          ? [...ids, s.scenario_id]
                          : ids.filter((id) => id !== s.scenario_id),
                      )
                    }
                  />
                ))}
                <p>
                  Required setup dependencies are included automatically. The
                  plan’s mandatory coverage remains unchanged.
                </p>
              </details>
              <div className="v-grid">
                <Select
                  label="Run in environment"
                  value={env}
                  options={names(
                    data.environments.filter((e: D) =>
                      v.body.environment_ids.includes(e.id),
                    ),
                    (e) => e.name + " · " + e.stage,
                  )}
                  onChange={setEnv}
                />
                <Select
                  label="Assign manual steps to"
                  value={assignee}
                  options={members.map((m) => ({ id: m.id, name: m.name }))}
                  onChange={setAssignee}
                />
              </div>
              <p>
                {dep
                  ? "Confirmed build: " + dep.build
                  : "An Application Manager must record the current deployment before execution."}
              </p>
              {data.environments.find((e: D) => e.id === env)?.stage ===
                "PROD" && (
                <Select
                  label="Production smoke authorisation"
                  value={approval}
                  onChange={setApproval}
                  options={data.production_approvals
                    .filter(
                      (a: D) =>
                        a.plan_id === plan.id &&
                        a.environment_id === env &&
                        a.deployment_id === dep?.id,
                    )
                    .map((a: D) => ({
                      id: a.id,
                      name: a.note + " · expires " + a.expires_at,
                    }))}
                />
              )}
              <button className="btn primary" disabled={busy || !env || !dep}>
                Start validation
              </button>
            </form>
          )}
        </>
      )}
    </article>
  );
}
function SummaryCard({
  sum,
  manage,
  busy,
  action,
}: {
  sum: D;
  manage: boolean;
  busy: boolean;
  action: Action;
}) {
  const [note, setNote] = useState("");
  return (
    <article className="v-card">
      <h2>{sum.title}</h2>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          action(
            () => validationReport(sum.plan_id),
            "Report and evidence exported",
          )
        }
      >
        Export report & evidence
      </button>
      <Status value={sum.outcome} /> <span>Plan version {sum.version}</span>
      {!sum.source_current && (
        <p>The plan’s source or version has changed. Review a fresh version.</p>
      )}
      <div className="v-scroll">
        <table className="v-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Environment</th>
              <th>Outcome</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {sum.coverage.map((c: D) => (
              <tr key={c.environment_id + c.scenario_id}>
                <td>
                  {c.title}
                  {!c.mandatory ? " (optional)" : ""}
                </td>
                <td>{c.environment_name}</td>
                <td>
                  <Status value={c.outcome} />
                </td>
                <td>{c.reviewed ? "Reviewed" : "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sum.missing_criteria.length > 0 && (
        <p>
          {sum.missing_criteria.length} acceptance criteria have no mapped test.
        </p>
      )}
      {sum.exclusions && <p>Scope exclusions: {sum.exclusions}</p>}
      <p>
        {sum.signoff_current
          ? "Current Test Manager conclusion: " + sum.signoff.outcome
          : sum.signoff
            ? "Earlier sign-off is stale."
            : "No current Test Manager sign-off."}
      </p>
      {manage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(
              () =>
                req("/plans/" + sum.plan_id + "/signoff", {
                  version: sum.version,
                  coverage_hash: sum.coverage_hash,
                  note,
                  exceptions: [],
                }),
              "Testing conclusion recorded",
            );
          }}
        >
          <Field
            label="Test Manager conclusion and exceptions"
            value={note}
            onChange={setNote}
            multiline
            required
          />
          <button className="btn" disabled={busy}>
            Record testing conclusion
          </button>
        </form>
      )}
    </article>
  );
}
function RunCard({
  run,
  manage,
  busy,
  action,
  userId,
}: {
  run: D;
  manage: boolean;
  busy: boolean;
  action: Action;
  userId: string;
}) {
  const [note, setNote] = useState("");
  const active = [
    "queued",
    "preflight",
    "running",
    "awaiting_input",
    "stop_requested",
  ].includes(run.status);
  return (
    <article className="v-card">
      <h2>
        {run.environment_name} · {run.build}
      </h2>
      <Status value={run.status} />{" "}
      <span className="v-muted">
        {new Date(run.created_at).toLocaleString()}
      </span>
      {run.reason && <p>{run.reason}</p>}
      {run.reconciliation_required && (
        <div className="v-error">
          A write may have completed before interruption. This environment is
          locked until the actual transaction and cleanup have been checked.
        </div>
      )}
      {run.attempts
        .filter((a: D) => a.selected)
        .map((a: D) => (
          <Attempt
            key={a.scenario_id}
            attempt={a}
            run={run}
            manage={manage}
            busy={busy}
            action={action}
            userId={userId}
          />
        ))}
      {manage && (
        <>
          <Field
            label="Review / reconciliation note"
            value={note}
            onChange={setNote}
            multiline
          />
          <div className="v-actions">
            {active && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(
                    () =>
                      req("/runs/" + run.id + "/stop", {
                        revision: run.revision,
                        note,
                      }),
                    "Stop requested",
                  )
                }
              >
                Stop run
              </button>
            )}
            {!active && (
              <button
                className="btn"
                disabled={busy || !note.trim()}
                onClick={() =>
                  action(
                    () =>
                      req("/runs/" + run.id + "/review", {
                        revision: run.revision,
                        note,
                      }),
                    "Results reviewed",
                  )
                }
              >
                Review recorded results
              </button>
            )}
            {run.reconciliation_required && (
              <button
                className="btn"
                disabled={busy || !note.trim()}
                onClick={() =>
                  action(
                    () =>
                      req("/runs/" + run.id + "/reconcile", {
                        revision: run.revision,
                        note,
                      }),
                    "Environment reconciliation recorded",
                  )
                }
              >
                Confirm transaction and cleanup checked
              </button>
            )}
            {!active && !run.reconciliation_required && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(
                    () =>
                      validationStart({
                        plan_id: run.plan_id,
                        version: run.version,
                        environment_id: run.environment_id,
                        deployment_id: run.deployment_id,
                        idempotency_key: crypto.randomUUID(),
                        retest_of: run.id,
                        assignee_id:
                          run.attempts.find((a: D) => a.assignee_id)
                            ?.assignee_id ?? "",
                        production_approval_id:
                          run.production_approval_id ?? "",
                      }),
                    "Retest queued",
                  )
                }
              >
                Retest same deployed build
              </button>
            )}
            {!active &&
              !run.reconciliation_required &&
              run.attempts.some((a: D) => a.outcome === "failed") && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    action(
                      () =>
                        validationStart({
                          plan_id: run.plan_id,
                          version: run.version,
                          environment_id: run.environment_id,
                          deployment_id: run.deployment_id,
                          retest_of: run.id,
                          selected: run.attempts
                            .filter((a: D) => a.outcome === "failed")
                            .map((a: D) => a.scenario_id),
                          assignee_id:
                            run.attempts.find((a: D) => a.assignee_id)
                              ?.assignee_id ?? "",
                          production_approval_id:
                            run.production_approval_id ?? "",
                        }),
                      "Failed scenarios and their setup dependencies queued for retest",
                    )
                  }
                >
                  Retest failed + required setup
                </button>
              )}
          </div>
        </>
      )}
      <details>
        <summary>Execution trail</summary>
        <pre>{JSON.stringify(run.events, null, 2)}</pre>
      </details>
    </article>
  );
}
function Attempt({
  attempt: a,
  run,
  manage,
  busy,
  action,
  userId,
}: {
  attempt: D;
  run: D;
  manage: boolean;
  busy: boolean;
  action: Action;
  userId: string;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, string>>({}),
    [observations, setObservations] = useState<Record<string, string>>({}),
    [note, setNote] = useState(""),
    [severity, setSeverity] = useState("high");
  const manual =
    a.body.route === "manual" &&
    a.assignee_id === userId &&
    !a.submitted_at &&
    ["completed", "awaiting_input"].includes(run.status) &&
    a.outcome === "not_run";
  const assess =
    manage &&
    a.body.route !== "manual" &&
    a.outcome === "needs_review" &&
    run.status === "awaiting_input";
  return (
    <div className="v-step">
      <h3>{a.body.title}</h3>
      <Status value={a.outcome} />{" "}
      <span>
        {a.body.route} · {a.review ? "reviewed" : "not reviewed"}
      </span>
      {a.reason && <p>{a.reason}</p>}
      <details open={manual || assess}>
        <summary>Steps, observations and evidence</summary>
        {a.body.prerequisites && <p>Prerequisites: {a.body.prerequisites}</p>}
        {a.body.cleanup && <p>Cleanup: {a.body.cleanup}</p>}
        {a.body.steps.map((step: D) => {
          const result = a.steps.find((s: D) => s.step_id === step.id);
          return (
            <div key={step.id}>
              <p>
                <b>{step.action}</b>
                <br />
                Expected: {step.expected}
              </p>
              {result && (
                <p>
                  Observed:{" "}
                  {typeof result.observed === "string"
                    ? result.observed
                    : JSON.stringify(result.observed)}{" "}
                  · <Status value={result.outcome} />
                </p>
              )}
              {(manual || (assess && result?.outcome === "needs_review")) && (
                <>
                  <Select
                    label={"Outcome — " + step.action}
                    value={outcomes[step.id] ?? ""}
                    options={(manual
                      ? ["passed", "failed", "needs_review", "skipped"]
                      : ["passed", "failed"]
                    ).map((id) => ({ id, name: id.replace(/_/g, " ") }))}
                    onChange={(v) =>
                      setOutcomes((o) => ({ ...o, [step.id]: v }))
                    }
                  />
                  {manual && (
                    <Field
                      label={"Actual observation — " + step.action}
                      value={observations[step.id] ?? ""}
                      onChange={(v) =>
                        setObservations((o) => ({ ...o, [step.id]: v }))
                      }
                      multiline
                    />
                  )}
                </>
              )}
            </div>
          );
        })}
        <div className="v-actions">
          {a.evidence.map((id: string) => (
            <button
              className="btn"
              key={id}
              disabled={busy}
              onClick={() =>
                action(() => validationEvidence(id), "Evidence downloaded")
              }
            >
              Download evidence {a.evidence.indexOf(id) + 1}
            </button>
          ))}
        </div>
        {manual && (
          <label>
            Attach supporting evidence (up to 10 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  action(async () => {
                    if (f.size > 10 * 1024 * 1024)
                      throw new Error("Maximum attachment size is 10 MB");
                    const data = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                          resolve(String(reader.result).split(",")[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(f);
                      },
                    );
                    await req(
                      "/runs/" +
                        run.id +
                        "/attempts/" +
                        a.scenario_id +
                        "/evidence",
                      { name: f.name, mime: f.type, data },
                    );
                  }, "Evidence attached");
              }}
            />
          </label>
        )}
        {(manual || assess) && (
          <>
            <Field
              label={
                manual
                  ? "Tester note and cleanup confirmation"
                  : "Evidence assessment rationale"
              }
              value={note}
              onChange={setNote}
              multiline
            />
            <button
              className="btn primary"
              disabled={busy || (assess && !note.trim())}
              onClick={() =>
                action(
                  () =>
                    req(
                      "/runs/" +
                        run.id +
                        "/attempts/" +
                        a.scenario_id +
                        (manual ? "/result" : "/assessment"),
                      {
                        revision: run.revision,
                        steps: outcomes,
                        ...(manual ? { observations } : {}),
                        note,
                      },
                    ),
                  "Results submitted",
                )
              }
            >
              {manual ? "Submit UAT observations" : "Record human assessment"}
            </button>
          </>
        )}
        {a.assessment && <p>Assessment: {a.assessment.note}</p>}
      </details>
      {manage && a.outcome === "failed" && (
        <div className="v-actions">
          <Select
            label="Defect severity"
            value={severity}
            onChange={setSeverity}
            options={["critical", "high", "medium", "low"].map((id) => ({
              id,
              name: id,
            }))}
          />
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              action(
                () =>
                  req("/defects", {
                    run_id: run.id,
                    scenario_id: a.scenario_id,
                    severity,
                    note,
                  }),
                "Defect recorded",
              )
            }
          >
            Record defect
          </button>
        </div>
      )}
    </div>
  );
}
function DefectCard({
  defect: d,
  manage,
  busy,
  action,
}: {
  defect: D;
  manage: boolean;
  busy: boolean;
  action: Action;
}) {
  const [note, setNote] = useState("");
  return (
    <article className="v-card">
      <h2>{d.title}</h2>
      <Status value={d.status} />{" "}
      <span>
        {d.severity} · {d.build}
      </span>
      <p>{d.note}</p>
      <p>Jira: {d.jira_key || d.sync_state}</p>
      {d.sync_error && <p>{d.sync_error}</p>}
      {manage && (
        <>
          <Field label="Resolution note" value={note} onChange={setNote} />
          <div className="v-actions">
            {d.status !== "closed" && (
              <button
                className="btn"
                disabled={busy || !note.trim()}
                onClick={() =>
                  action(
                    () =>
                      req("/defects/" + d.id + "/close", {
                        revision: d.revision,
                        note,
                      }),
                    "Defect closed after passing retest",
                  )
                }
              >
                Close after passing retest
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(
                  () =>
                    req("/defects/" + d.id + "/sync", {
                      revision: d.revision,
                      note,
                    }),
                  "Jira sync checked",
                )
              }
            >
              {d.jira_key ? "Refresh Jira status" : "Sync defect to Jira"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
function Agents({
  data,
  sources,
  busy,
  manage,
  action,
}: {
  data: D;
  sources: D[];
  busy: boolean;
  manage: boolean;
  action: Action;
}) {
  const [role, setRole] = useState("test-designer"),
    [story, setStory] = useState(""),
    [plan, setPlan] = useState(""),
    [run, setRun] = useState(""),
    [note, setNote] = useState("");
  return (
    <>
      <p>
        Agents propose tests and assess recorded evidence. Test Managers approve
        scope and conclusions. Agent instructions, models, knowledge documents
        and budgets are managed in{" "}
        <Link to="/admin/agents">Administration → Agents & AI</Link>.
      </p>
      {manage && (
        <form
          className="v-card"
          onSubmit={(e) => {
            e.preventDefault();
            action(
              () =>
                req("/agents", {
                  role,
                  story_id: story,
                  plan_id: plan,
                  run_id: run,
                  note,
                }),
              "Agent request queued",
            );
          }}
        >
          <Select
            label="Agent"
            value={role}
            onChange={setRole}
            options={[
              { id: "test-designer", name: "Test Design Agent" },
              { id: "regression-analyst", name: "Regression Scope Agent" },
              { id: "result-assessor", name: "Result Assessment Agent" },
              { id: "validation-summariser", name: "Validation Summary Agent" },
            ]}
          />
          {role === "test-designer" && (
            <Select
              label="Story"
              value={story}
              onChange={setStory}
              options={names(sources, (s) => s.title)}
            />
          )}{" "}
          {["regression-analyst", "validation-summariser"].includes(role) && (
            <Select
              label="Plan"
              value={plan}
              onChange={setPlan}
              options={names(data.plans, (p) => latest(p).body.title)}
            />
          )}{" "}
          {role === "result-assessor" && (
            <Select
              label="Run"
              value={run}
              onChange={setRun}
              options={names(
                data.runs,
                (r) => r.environment_name + " · " + r.build + " · " + r.status,
              )}
            />
          )}
          <Field
            label="Focus or questions"
            value={note}
            onChange={setNote}
            multiline
          />
          <button className="btn primary" disabled={busy}>
            Run agent
          </button>
          <p className="v-muted">
            Uses the customer’s configured AI account and budget. The Test
            Execution Agent is invoked only during approved agent-assisted
            browser runs.
          </p>
        </form>
      )}
      {data.agent_jobs.map((j: D) => (
        <div className="v-card" key={j.id}>
          <h3>{j.role}</h3>
          <Status value={j.status} />
          {j.error && <p>{j.error}</p>}
          {j.result && <pre>{JSON.stringify(j.result.result, null, 2)}</pre>}
        </div>
      ))}
    </>
  );
}
function ReleasePanel({
  data,
  sources,
  allowed,
  busy,
  action,
}: {
  data: D;
  sources: D[];
  allowed: boolean;
  busy: boolean;
  action: Action;
}) {
  const [plan, setPlan] = useState(""),
    [env, setEnv] = useState(""),
    [build, setBuild] = useState(""),
    [evidence, setEvidence] = useState(""),
    [note, setNote] = useState(""),
    [readiness, setReadiness] = useState(""),
    [exception, setException] = useState("");
  const p = data.plans.find((p: D) => p.id === plan),
    v = p ? latest(p) : null,
    sum = data.summaries.find((s: D) => s.plan_id === plan);
  const dep = data.deployments
    .filter(
      (d: D) =>
        d.environment_id === env &&
        v?.body.story_ids.every((id: string) => d.story_ids.includes(id)),
    )
    .sort((a: D, b: D) => b.at.localeCompare(a.at))[0];
  return (
    <>
      <p>
        <Link to="/validation">Open Validation dashboard</Link> ·{" "}
        <Link to="/am/changes?stage=release">Existing release / CNC work</Link>
      </p>
      <p>
        Deployment confirmations record a build already implemented in the
        target environment. These controls do not deploy software.
      </p>
      <Select
        label="Validation plan"
        value={plan}
        onChange={setPlan}
        options={names(data.plans, (p) => latest(p).body.title)}
      />
      {sum && (
        <SummaryCard sum={sum} manage={false} busy={busy} action={action} />
      )}{" "}
      {allowed && v && (
        <>
          <form
            className="v-card"
            onSubmit={(e) => {
              e.preventDefault();
              action(
                () =>
                  req("/deployments", {
                    environment_id: env,
                    story_ids: v.body.story_ids,
                    build,
                    evidence,
                  }),
                "Deployment confirmation recorded",
              );
            }}
          >
            <h2>Confirm implemented build</h2>
            <Select
              label="Target environment"
              value={env}
              onChange={setEnv}
              options={names(
                data.environments.filter((e: D) =>
                  v.body.environment_ids.includes(e.id),
                ),
                (e) => e.name + " · " + e.stage,
              )}
            />
            <Field
              label="Build / package identifier"
              value={build}
              onChange={setBuild}
              required
            />
            <Field
              label="Deployment confirmation and evidence reference"
              value={evidence}
              onChange={setEvidence}
              multiline
              required
            />
            <button className="btn" disabled={busy || !env}>
              Record deployment
            </button>
          </form>
          <div className="v-card">
            <h2>Release decision</h2>
            <Field
              label="Decision rationale"
              value={note}
              onChange={setNote}
              multiline
            />
            <Field
              label="Operational readiness, rollback and support arrangements"
              value={readiness}
              onChange={setReadiness}
              multiline
            />
            <Field
              label="Exception rationale (only where policy permits)"
              value={exception}
              onChange={setException}
              multiline
            />
            <div className="v-actions">
              {["approve", "hold"].map((decision) => (
                <button
                  className="btn"
                  key={decision}
                  disabled={busy || !note.trim() || !readiness.trim()}
                  onClick={() =>
                    action(
                      () =>
                        req("/releases", {
                          plan_id: plan,
                          version: v.version,
                          coverage_hash: sum.coverage_hash,
                          decision,
                          note,
                          operational_readiness: readiness,
                          exception_reason: exception,
                        }),
                      "Release decision recorded",
                    )
                  }
                >
                  {decision === "approve" ? "Approve release" : "Hold release"}
                </button>
              ))}
              {data.environments.find((e: D) => e.id === env)?.stage ===
                "PROD" && (
                <button
                  className="btn"
                  disabled={busy || !dep || !note.trim()}
                  onClick={() =>
                    action(
                      () =>
                        req("/production-approvals", {
                          plan_id: plan,
                          version: v.version,
                          environment_id: env,
                          deployment_id: dep.id,
                          note,
                        }),
                      "Production smoke authorisation recorded",
                    )
                  }
                >
                  Authorise production smoke for this deployment
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {!allowed && (
        <p>
          Only an Application Manager can confirm deployments or make release
          decisions.
        </p>
      )}
      <h2>Decision history</h2>
      {data.releases
        .filter((r: D) => !plan || r.plan_id === plan)
        .map((r: D) => (
          <div className="v-card" key={r.id}>
            <Status value={r.decision} />
            <p>{r.note}</p>
            <p className="v-muted">
              {r.at} · {r.actor}
            </p>
          </div>
        ))}
    </>
  );
}
