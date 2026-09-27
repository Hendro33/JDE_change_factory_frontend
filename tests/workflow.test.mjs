import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function load(path) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}
const { inAmStage, AM_STAGES } = await load("../src/pages/am/workflow.ts");
const { inInsightPeriod } = await load("../src/services/insightPeriod.ts");
const story = (phase, action, extra = {}) => ({lifecycle: {phase, nextAction: {action}, ...extra}});
const queues = (c) => AM_STAGES.filter((s) => inAmStage(c, s.key)).map((s) => s.key);

test("Domain Owner work cannot enter the Application Manager dashboard", () => {
  assert.deepEqual(queues(story("understand", "start_analysis")), []);
  assert.deepEqual(queues(story("story_review", "review_story")), []);
  assert.deepEqual(queues(story("story_review", "authorise_delivery")), ["backlog"]);
});
test("solution preparation and approval remain in architecture", () => {
  assert.deepEqual(queues(story("solutioning", "rerun_solutioning")), ["architecture"]);
  assert.deepEqual(queues(story("solution_review", "approve_design")), ["architecture"]);
});
test("technical preparation is distinct from implementation and DEV CNC activation", () => {
  assert.deepEqual(queues(story("delivery", "start_technical_prepare")), ["approved"]);
  assert.deepEqual(queues(story("delivery", "approve_package")), ["delivery"]);
  assert.deepEqual(queues(story("delivery", "record_cnc")), ["delivery"]);
});
test("functional approved writes stay queued until execution starts", () => {
  const c = {...story("delivery"), changeApproval: {status: "approved"}, exactChange: {execution: {writeState: "ready"}}};
  assert.deepEqual(queues(c), ["approved"]);
  c.exactChange.execution.writeState = "in_progress";
  assert.deepEqual(queues(c), ["delivery"]);
});
test("failed validation cannot be counted as release-ready", () => {
  assert.deepEqual(queues(story("validation", "start_technical_prepare", {health: "failed"})), ["validation"]);
});
test("unfinished as-built is distinct from completed JADE delivery", () => {
  assert.deepEqual(queues(story("release", "finalise_asbuilt")), ["asbuilt"]);
  assert.deepEqual(queues(story("done", null, {outcome: "delivered"})), ["release", "completed"]);
  assert.deepEqual(queues(story("done", null, {outcome: "rejected"})), []);
  assert.deepEqual(queues(story("done", null, {outcome: "resolved_without_change"})), ["completed"]);
});
test("Insights includes the period boundary and excludes older/future/invalid dates", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  for (const [period, days] of [["week",7],["month",30],["year",365]]) {
    const boundary = now - days * 86400000;
    assert.equal(inInsightPeriod(new Date(boundary).toISOString(), period, now), true);
    assert.equal(inInsightPeriod(new Date(boundary-1).toISOString(), period, now), false);
    assert.equal(inInsightPeriod(new Date(now+1).toISOString(), period, now), false);
    assert.equal(inInsightPeriod("invalid", period, now), false);
  }
  assert.equal(inInsightPeriod("2000-01-01", "lifetime", now), true);
});
