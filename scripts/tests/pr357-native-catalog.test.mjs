import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { assertScenarioResult, cleanupNativeCatalog, launcherSettings, nativeEvidenceBinding, NATIVE_SCENARIOS, updatedCleanupReport, validateOwnedState } from "./pr357-native-catalog.mjs";

// These tests verify launcher contracts only. The launcher itself must run on
// installed PostgreSQL 17 before any real catalog/replay result can be claimed.
test("native launcher requires opt in and refuses existing connection settings", () => {
  assert.throws(() => launcherSettings({}), /Opt in/);
  for (const key of ["DB_URL", "DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATA", "PGSERVICE", "PR357_NATIVE_DB_URL"]) {
    assert.throws(() => launcherSettings({ RUN_PR357_NATIVE_CATALOG: "1", [key]: "not-a-real-connection" }), /Existing database connection/);
  }
});

test("native CI invocation refuses unbound hosted metadata and emits versioned nonce binding", () => {
  assert.throws(()=>launcherSettings({RUN_PR357_NATIVE_CATALOG:"1",GITHUB_ACTIONS:"true"}),/exact hosted checkout/);
  const settings={sourceHead:"a".repeat(40),run:{id:"101",attempt:"2",job:"native-catalog"}};
  const nonce=randomUUID();
  assert.deepEqual(nativeEvidenceBinding(settings,nonce),{schema_version:2,producer:"pr357-native-catalog",checkout_sha:settings.sourceHead,
    run_id:"101",run_attempt:"2",job:"native-catalog",nonce});
});

test("native cleanup is idempotent when no cluster state was created", () => {
  const directory = mkdtempSync(join(tmpdir(), "liftgo-native-contract-"));
  try { assert.deepEqual(cleanupNativeCatalog({ statePath: join(directory, "absent.json") }, {}), { status: "PASS", disposition: "no_owned_cluster_state", stopped: true, removed: true }); }
  finally { rmSync(directory, { recursive: true }); }
});

test("always cleanup preserves the original verified stop evidence and marks unfinished runs failed", () => {
  const first = { status: "PASS", disposition: "owned_cluster_stopped_and_removed", stopped: true, removed: true };
  const followup = { status: "PASS", disposition: "no_owned_cluster_state", stopped: true, removed: true };
  const report = updatedCleanupReport({ status: "PASS", cleanup: first }, followup);
  assert.deepEqual(report.cleanup, first);
  assert.deepEqual(report.cleanup_followup, followup);
  assert.equal(updatedCleanupReport({ status: "RUNNING", cleanup: { status: "PENDING" } }, first).status, "FAIL");
});

test("cleanup state is bound to its exact private cluster, nonce, source and workflow run", () => {
  const directory = mkdtempSync(join(tmpdir(), "liftgo-pr357-pg-"));
  const settings = { sourceHead: "a".repeat(40), run: { id: "101", attempt: "1", job: "native" } };
  const state = { purpose: "pr357-native-catalog", ...settings, clusterDirectory: directory, nonce: randomUUID() };
  const marker = { purpose: "pr357-catalog-validation", nonce: state.nonce, ...settings };
  const markerPath = join(directory, ".liftgo-pr357-temporary.json");
  writeFileSync(markerPath, JSON.stringify(marker), { mode: 0o600 });
  try {
    assert.equal(validateOwnedState(state, settings), state);
    assert.throws(() => validateOwnedState({ ...state, sourceHead: "b".repeat(40) }, settings), /HEAD mismatch/);
    assert.throws(() => validateOwnedState({ ...state, run: { ...state.run, id: "102" } }, settings), /run mismatch/);
    assert.throws(() => validateOwnedState({ ...state, nonce: randomUUID() }, settings), /marker mismatch/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("negative controls require real audit failure with every expected finding", () => {
  const baseline = NATIVE_SCENARIOS.find((scenario) => scenario.name === "baseline");
  assert.deepEqual(assertScenarioResult(baseline, { status: "PASS", findings: [] }), []);
  assert.throws(() => assertScenarioResult(baseline, { status: "FAIL", findings: [{ code: "RLS_DISABLED" }] }), /baseline failed/);
  for (const scenario of NATIVE_SCENARIOS.filter((scenario) => scenario.expected.length)) {
    assert.throws(() => assertScenarioResult(scenario, { status: "PASS", findings: [] }), /not detected/);
    assert.deepEqual(assertScenarioResult(scenario, { status: "FAIL", findings: scenario.expected.map((code) => ({ code })) }), [...new Set(scenario.expected)].sort());
  }
  const publicGrant = NATIVE_SCENARIOS.find((scenario) => scenario.name === "public_table_grant");
  assert.throws(() => assertScenarioResult(publicGrant, { status: "FAIL", findings: [{ code: "PUBLIC_ACL_PRESENT" }] }), /not detected/);
});

test("fixture plan covers all three RLS contracts and non-RLS, inherited and SET ROLE access", () => {
  const names = new Set(NATIVE_SCENARIOS.map((scenario) => scenario.name));
  assert.equal(names.size, NATIVE_SCENARIOS.length);
  for (const name of ["baseline", "counters_rls_disabled", "object_ledger_rls_disabled", "reference_ledger_rls_disabled",
    "counter_policy_added", "object_ledger_policy_added", "reference_ledger_policy_added", "public_table_grant", "public_column_grant",
    "inherited_table_grant", "set_role_inherited_owner", "set_role_inherited_acl", "service_without_bypass", "product_non_rls_privilege", "inherited_relation_exposure"]) {
    assert(names.has(name), name);
  }
});
