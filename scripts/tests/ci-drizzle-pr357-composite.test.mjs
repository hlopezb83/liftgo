import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { evaluateCatalog, TARGET_TABLES } from "./pr357-catalog-audit.mjs";
import { NATIVE_SCENARIOS } from "./pr357-native-catalog.mjs";
import { evaluateStaticContracts, loadCanonicalContractHistory, classifyLegacyDiagnostics } from "../ci-pr357-static-contracts.mjs";
import { digestEvidence, sourceEvidence, SOURCE_GUARD_PATHS, validateCompositeEvidence } from "../ci-pr357-composite.mjs";

// Protocol tests using explicitly synthetic catalog snapshots. None starts
// PostgreSQL, authenticates against a service or establishes that a replay ran.
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
function sourceFixture() {
  const directory = mkdtempSync(join(tmpdir(), "liftgo-composite-gate-source-"));
  try {
    const files = ["supabase/config.toml", "drizzle/migrations/meta/_journal.json", ...SOURCE_GUARD_PATHS];
    for (const lane of ["supabase/migrations", "drizzle/migrations"]) {
      files.push(...readdirSync(join(projectRoot, lane)).filter((name) => name.endsWith(".sql")).map((name) => `${lane}/${name}`));
    }
    for (const file of new Set(files)) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      copyFileSync(join(projectRoot, file), join(directory, file));
    }
    writeFileSync(join(directory, "package.json"), '{"type":"module"}\n');
    const git = (args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "-q"]); git(["add", "."]);
    // This synthetic, private Git fixture is deleted after these protocol
    // tests. It neither changes product history nor invokes repository hooks.
    git(["-c", "user.name=Protocol Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "synthetic composite source fixture"]);
    return directory;
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}
const root = sourceFixture();
after(() => rmSync(root, { recursive: true, force: true }));
const SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const NONCE_NATIVE = "11111111-1111-4111-8111-111111111111";
const NONCE_SUPABASE = "22222222-2222-4222-8222-222222222222";
const START = Date.now() - 120_000;

function snapshotFixture() {
  const role = (name, extra = {}) => ({ name, superuser: false, bypass_rls: false,
    create_role: false, create_database: false, replication: false, inherit: true, login: false, ...extra });
  const effective_privileges = [];
  for (const table of TARGET_TABLES) for (const name of ["anon", "authenticated", "service_role", "postgres"]) {
    for (const [scope, privileges] of [["table", ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]],
      ["column", ["SELECT", "INSERT", "UPDATE", "REFERENCES"]]]) {
      for (const privilege of privileges) effective_privileges.push({ table, role: name, scope, privilege,
        allowed: name === "postgres" || (name === "service_role" && ["SELECT", "INSERT", "UPDATE"].includes(privilege)) });
    }
  }
  return {
    tables: TARGET_TABLES.map((name) => ({ name, kind: "r", owner: "postgres", rls_enabled: true, rls_forced: false })),
    roles: [role("anon"), role("authenticated"), role("service_role", { bypass_rls: true }), role("postgres", { superuser: true })],
    policies: TARGET_TABLES.slice(1).map((table, index) => ({ table, name: `closed_${index}`, command: "*", permissive: true, roles: ["PUBLIC"], roles_public_only: true,
      using_false: true, check_false: true, using_expression_hash: createHash("md5").update("false").digest("hex"), check_expression_hash: createHash("md5").update("false").digest("hex") })),
    table_acl: [], column_acl: [], effective_privileges,
    role_reachability: ["anon", "authenticated", "service_role", "postgres"].flatMap((from_role) =>
      ["anon", "authenticated", "service_role", "postgres"].map((reachable_role) => ({ from_role, reachable_role,
        member: from_role === reachable_role, usage: from_role === reachable_role, set_role: from_role === reachable_role }))),
    memberships: [], public_schema_acl: [], default_acl: [], inheritance: [],
    schema_privileges: ["anon", "authenticated", "service_role", "postgres"].map((role) => ({ role, usage: true, create: role === "postgres" })),
  };
}

function scenarioSnapshot(name) {
  const s = snapshotFixture();
  const privilege = (table, operation, scope = "table") => {
    s.effective_privileges.find((p) => p.table === table && p.role === "authenticated" && p.scope === scope && p.privilege === operation).allowed = true;
  };
  const disable = { counters_rls_disabled: 0, object_ledger_rls_disabled: 1, reference_ledger_rls_disabled: 2 };
  if (Object.hasOwn(disable, name)) s.tables[disable[name]].rls_enabled = false;
  else if (name === "counter_policy_added") s.policies.push({ ...s.policies[0], table: TARGET_TABLES[0], using_false: false });
  else if (name === "object_ledger_policy_added" || name === "reference_ledger_policy_added") {
    s.policies.push({ ...s.policies[name === "object_ledger_policy_added" ? 0 : 1], name: "extra_policy", using_false: false });
  } else if (name === "public_table_grant" || name === "public_column_grant") {
    const table = TARGET_TABLES[name === "public_table_grant" ? 1 : 2];
    s[name === "public_table_grant" ? "table_acl" : "column_acl"].push({ table, grantee: "PUBLIC", grantor: "postgres", is_grantable: false, privilege: "SELECT",
      ...(name === "public_column_grant" ? { column: "marker" } : {}) });
    privilege(table, "SELECT", name === "public_table_grant" ? "table" : "column");
  } else if (name === "inherited_table_grant") privilege(TARGET_TABLES[1], "SELECT");
  else if (name === "set_role_inherited_owner") Object.assign(s.role_reachability.find((r) => r.from_role === "authenticated" && r.reachable_role === "postgres"), { member: true, usage: false, set_role: true });
  else if (name === "set_role_inherited_acl") privilege(TARGET_TABLES[2], "TRUNCATE");
  else if (name === "service_without_bypass") s.roles.find((r) => r.name === "service_role").bypass_rls = false;
  else if (name === "product_non_rls_privilege") privilege(TARGET_TABLES[1], "TRUNCATE");
  else if (name === "inherited_relation_exposure") s.inheritance.push({ child_schema: "public", child_name: TARGET_TABLES[1], parent_schema: "public", parent_name: "synthetic_exposed_parent", child_is_partition: false });
  else assert.equal(name, "baseline", "Every declared negative must have a synthetic catalog mutation");
  return s;
}

function nativeFixture(binding) {
  const scenarios = NATIVE_SCENARIOS.map((scenario) => {
    const snapshot = scenarioSnapshot(scenario.name), result = evaluateCatalog(snapshot);
    assert.equal(result.status, scenario.expected.length ? "FAIL" : "PASS", scenario.name);
    for (const code of scenario.expected) assert(result.findings.some((f) => f.code === code), `${scenario.name}/${code}`);
    return { name: scenario.name, status: "PASS", expected_audit_status: scenario.expected.length ? "FAIL" : "PASS",
      actual_audit_status: result.status, detected_codes: [...new Set(result.findings.map((f) => f.code))].sort(), real_postgresql: true, snapshot };
  });
  const cleanup = { status: "PASS", disposition: "owned_cluster_stopped_and_removed", stopped: true, removed: true,
    nonce: NONCE_NATIVE, verified_at: START + 20_000 };
  const followup = { ...cleanup, disposition: "no_owned_cluster_state", verified_at: START + 21_000 };
  const nativeReport = { ...binding, producer: "pr357-native-catalog", job: "native-catalog", nonce: NONCE_NATIVE,
    source_head: SHA, status: "PASS", started_at: START + 1_000, completed_at: START + 20_000,
    postgresql_version: "postgres (PostgreSQL) 17.11", stage: "completed", scenarios,
    baseline_snapshot: snapshotFixture(), restored_baselines: NATIVE_SCENARIOS.map((s) => ({ after: s.name, status: "PASS", real_postgresql: true, snapshot: snapshotFixture() })),
    cleanup, cleanup_followup: followup };
  return { nativeReport, nativeCleanup: { ...binding, producer: "pr357-native-catalog", job: "native-catalog", nonce: NONCE_NATIVE,
    source_head: SHA, cleanup: followup } };
}

function seal(input) {
  input.digests = {
    contracts: digestEvidence({ staticReport: input.staticReport }),
    native: digestEvidence({ nativeReport: input.nativeReport, nativeCleanup: input.nativeCleanup }),
    supabase: digestEvidence({ supabaseReport: input.supabaseReport, supabaseCleanup: input.supabaseCleanup }),
  };
  return input;
}

function rejects(mutate, { reseal = true } = {}) {
  const evidence = evidenceFixture(); mutate(evidence);
  if (reseal) seal(evidence);
  assert.throws(() => validateCompositeEvidence(evidence));
}

function originalLint(sql) {
  const temporary = mkdtempSync(join(tmpdir(), "liftgo-original-linter-contract-"));
  try {
    const file = join(temporary, "20261029_fixture.sql");
    writeFileSync(file, sql);
    const result = spawnSync(process.execPath, [join(root, "scripts/lint-migrations.ts"), file], { cwd: temporary, encoding: "utf8" });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

const ordinary = `CREATE TABLE public.customer_owned_items (id uuid PRIMARY KEY, user_id uuid);
  GRANT SELECT ON public.customer_owned_items TO authenticated;
  ALTER TABLE public.customer_owned_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY owned_read ON public.customer_owned_items FOR SELECT TO authenticated USING(user_id = auth.uid());`;

// The final producer protocol is assembled below from actual source manifests
// and synthetic (never database-collected) catalog snapshots.
let cachedSource, cachedTemplate;
function evidenceFixture() {
  return structuredClone(cachedTemplate ??= buildEvidenceFixture());
}
function buildEvidenceFixture() {
  const source = cachedSource ??= sourceEvidence(root);
  const context = { sha: SHA, runId: "200", attempt: "2", startedAt: START };
  const binding = { schema_version: 2, checkout_sha: SHA, run_id: context.runId, run_attempt: context.attempt };
  const assessment = evaluateStaticContracts(source.history.history, { prelude: source.history.prelude });
  const lint = spawnSync(process.execPath, [join(root, "scripts/lint-migrations.ts"), ...source.history.files], { cwd: root, encoding: "utf8" });
  assert.ifError(lint.error);
  const disposition = classifyLegacyDiagnostics(lint.stderr, assessment);
  const staticReport = { ...binding, producer: "pr357-static-contracts", nonce: "33333333-3333-4333-8333-333333333333", created_at: START,
    status: "REPLAY_REQUIRED", source_digest: digestEvidence({ ...source, history: undefined }), assessment, disposition,
    lint: { exit: lint.status, files: source.history.files, stdout: lint.stdout, stderr: lint.stderr } };
  const { nativeReport, nativeCleanup } = nativeFixture(binding);
  const preparedAt = START + 30_000, snapshot = snapshotFixture();
  const project = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(readFileSync(join(root, "supabase/config.toml"), "utf8"))[1];
  const owned = { id: "a".repeat(64), name: `supabase_db_${project}`, image: "public.ecr.aws/supabase/postgres:17.4.1.068",
    created_at: new Date(preparedAt + 1_000).toISOString(), started_at: new Date(preparedAt + 2_000).toISOString(), data_mount: "/var/lib/postgresql/data",
    volume: `supabase_db_${project}`, volume_created_at: new Date(preparedAt + 1_000).toISOString() };
  snapshot.identity = { database: "postgres", data_directory: owned.data_mount, transaction_read_only: "on", server_address: null,
    current_user: "postgres", session_user: "postgres", server_version_num: 170011 };
  snapshot.auth_schema = { users_present: true, uid_present: true };
  snapshot.supabase_versions = source.supabaseSource.map((v) => ({ version: /\/(\d+)_/.exec(v.path)[1] }));
  snapshot.drizzle_ledger = source.manifest.migrations.map((v) => ({ hash: v.sha256, created_at: String(v.when) }));
  const supabaseReport = { ...binding, producer: "pr357-supabase-catalog", job: "supabase-replay", nonce: NONCE_SUPABASE,
    status: "PASS", prepared_at: preparedAt, baseline_verified_at: preparedAt + 500, collected_at: START + 60_000,
    baseline: { project_resources_absent: true, tracked_sources_clean: true, exact_sql_inventory: true, one_use_marker: true,
      config_original_bound: true, config_seed_disabled: true },
    source_binding: { drizzle_source: source.drizzleSource, patcher_sha256: source.patcherSha256, replay_guard_sha256: source.replayGuardSha256,
      database_guard_sha256: source.databaseGuardSha256, audit_guard_sha256: source.auditGuardSha256, collector_sha256: source.collectorSha256,
      drizzle_journal_sha256: source.drizzleJournalSha256, config_source_sha256: source.configSourceSha256, config_replay_sha256: source.configReplaySha256 },
    owned, replay: { supabase_count: source.supabaseSource.length, drizzle_count: source.manifest.migrations.length,
      supabase_source: source.supabaseSource, supabase_runner_transformation: source.expectedPatchedSupabase, manifest: source.manifest }, snapshot };
  const supabaseCleanup = { ...binding, producer: "pr357-supabase-catalog", job: "supabase-replay", nonce: NONCE_SUPABASE,
    status: "PASS", prepared_at: preparedAt, verified_at: START + 61_000, ownership_verified: true, stop_attempted: true, stop_command_failed: false,
    project_resources_remaining: false, verified_owned_resources: { containers: 2, volumes: 2, networks: 1 } };
  return seal(structuredClone({ root, context, jobs: { changes: "success", contracts: "success", gitleaks: "success", "native-catalog": "success", "supabase-replay": "success" },
    staticReport, nativeReport, nativeCleanup, supabaseReport, supabaseCleanup }));
}

test("synthetic evidence proves the protocol only after all current-run checks", () => {
  assert.equal(validateCompositeEvidence(evidenceFixture()).status, "PASS");
});

test("the unchanged original linter accepts ordinary complete product contracts", () => {
  const result = originalLint(ordinary);
  assert.equal(result.status, 0, result.output);
});

test("the original ordinary GRANT, RLS and POLICY prerequisites still fail independently", () => {
  for (const [statement, reason] of [
    ["GRANT SELECT ON public.customer_owned_items TO authenticated;", "GRANT ON public.customer_owned_items"],
    ["ALTER TABLE public.customer_owned_items ENABLE ROW LEVEL SECURITY;", "ENABLE ROW LEVEL SECURITY"],
    ["CREATE POLICY owned_read ON public.customer_owned_items FOR SELECT TO authenticated USING(user_id = auth.uid());", "CREATE POLICY ON public.customer_owned_items"],
  ]) {
    const result = originalLint(ordinary.replace(statement, ""));
    assert.equal(result.status, 1, result.output); assert(result.output.includes(reason), result.output);
  }
});

test("an unrelated safe function cannot cover an unsafe SECURITY DEFINER function", () => {
  const result = originalLint(`CREATE FUNCTION public.safe() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT 1 $$;
    CREATE FUNCTION public.unsafe() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;`);
  assert.equal(result.status, 1, result.output); assert.match(result.output, /unsafe.*SET search_path/);
});

test("broad product policies remain prohibited while the service-only original rule is preserved", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    const result = originalLint(`CREATE POLICY broad ON public.customer_owned_items FOR ALL TO ${role} USING(true);`);
    assert.equal(result.status, 1, result.output); assert.match(result.output, /prohibido.*FOR ALL/);
  }
  const service = originalLint("CREATE POLICY backend_only ON public.customer_owned_items FOR ALL TO service_role USING(true);");
  assert.equal(service.status, 0, service.output);
});

test("missing, skipped, cancelled, failed and unfinished dependency jobs all block", () => {
  for (const name of ["changes", "contracts", "gitleaks", "native-catalog", "supabase-replay"]) {
    for (const result of [undefined, "skipped", "cancelled", "failure", "queued", "in_progress", "neutral", "timed_out"]) {
      rejects((e) => { if (result === undefined) delete e.jobs[name]; else e.jobs[name] = result; });
    }
  }
});

test("replay, native controls and either cleanup cannot be omitted", () => {
  for (const name of ["staticReport", "nativeReport", "nativeCleanup", "supabaseReport", "supabaseCleanup"]) {
    rejects((e) => { delete e[name]; }, { reseal: false });
  }
});

test("every evidence producer must match this SHA, run and attempt", () => {
  for (const name of ["staticReport", "nativeReport", "nativeCleanup", "supabaseReport", "supabaseCleanup"]) {
    for (const [field, value] of [["checkout_sha", "f".repeat(40)], ["run_id", "100"], ["run_attempt", "0"]]) {
      rejects((e) => { e[name][field] = value; });
    }
  }
});

test("a demonstrated static failure blocks even if the replay catalog passes", () => {
  rejects((e) => { e.staticReport.status = "FAIL"; e.staticReport.failures = [{ code: "UNEXPECTED_GRANT", table: TARGET_TABLES[0] }]; });
});

test("producer digests block modified artifact content and absent evidence hashes", () => {
  rejects((e) => { e.supabaseReport.snapshot.tables[0].owner = "another_owner"; }, { reseal: false });
  rejects((e) => { e.staticReport.requiresFreshReplay = false; }, { reseal: false });
  for (const name of ["contracts", "native", "supabase"]) rejects((e) => { delete e.digests[name]; }, { reseal: false });
});

test("dirty or untracked source and guard code cannot establish checkout provenance", () => {
  const evidence = evidenceFixture();
  for (const file of [SOURCE_GUARD_PATHS[0], SOURCE_GUARD_PATHS[1], "supabase/config.toml", cachedSource.drizzleSource[0].path]) {
    const path = join(root, file), original = readFileSync(path);
    try {
      writeFileSync(path, Buffer.concat([original, Buffer.from("\n-- synthetic changed source\n")]));
      assert.throws(() => validateCompositeEvidence(evidence));
    } finally { writeFileSync(path, original); }
  }
  const untrackedSql = join(root, "supabase/migrations/20991231000000_untracked_fixture.sql");
  try {
    writeFileSync(untrackedSql, "SELECT 1;\n");
    assert.throws(() => validateCompositeEvidence(evidence));
  } finally { rmSync(untrackedSql); }
  const guard = SOURCE_GUARD_PATHS[0];
  try {
    execFileSync("git", ["update-index", "--force-remove", "--", guard], { cwd: root, stdio: "pipe" });
    assert.throws(() => validateCompositeEvidence(evidence));
  } finally { execFileSync("git", ["reset", "-q", "HEAD", "--", guard], { cwd: root, stdio: "pipe" }); }
  assert.equal(validateCompositeEvidence(evidence).status, "PASS", "Restoring only this private fixture restores its source evidence");
});

test("legacy evidence keeps every unrelated linter diagnostic blocking", () => {
  rejects((e) => {
    e.staticReport.lint.stderr += "::error file=drizzle/migrations/0123_new.sql::Función SECURITY DEFINER `public.unsafe` sin `SET search_path = public` en su encabezado\n";
    e.staticReport.disposition = classifyLegacyDiagnostics(e.staticReport.lint.stderr, e.staticReport.assessment);
  });
  rejects((e) => { e.staticReport.assessment.contracts[0].authoredProperties.policyCount = 1; });
  rejects((e) => { e.staticReport.lint.exit = 2; });
  rejects((e) => {
    e.staticReport.lint.stderr = ""; e.staticReport.lint.stdout = "Forged clean linter result\n"; e.staticReport.lint.exit = 0;
    e.staticReport.disposition = classifyLegacyDiagnostics("", e.staticReport.assessment);
  });
  rejects((e) => { e.staticReport.lint.files.pop(); });
});

test("the replay baseline requires every explicit precondition", () => {
  for (const key of ["project_resources_absent", "tracked_sources_clean", "exact_sql_inventory", "one_use_marker", "config_original_bound", "config_seed_disabled"]) {
    rejects((e) => { e.supabaseReport.baseline[key] = false; });
    rejects((e) => { delete e.supabaseReport.baseline[key]; });
  }
});

test("source, configuration, runner transformation and receipt manifest changes block", () => {
  for (const key of ["patcher_sha256", "replay_guard_sha256", "database_guard_sha256", "audit_guard_sha256", "collector_sha256",
    "drizzle_journal_sha256", "config_source_sha256", "config_replay_sha256"]) {
    rejects((e) => { e.supabaseReport.source_binding[key] = "f".repeat(64); });
  }
  rejects((e) => { e.supabaseReport.source_binding.drizzle_source.pop(); });
  rejects((e) => { e.supabaseReport.replay.supabase_source.pop(); });
  rejects((e) => { e.supabaseReport.replay.supabase_runner_transformation[0].sha256 = "f".repeat(64); });
  rejects((e) => { e.supabaseReport.replay.manifest.excludedReceipts.pop(); });
  rejects((e) => { e.supabaseReport.replay.manifest.migrations[0].sha256 = "f".repeat(64); });
});

test("all Supabase versions and the exact Drizzle ledger must actually be present", () => {
  rejects((e) => { e.supabaseReport.snapshot.supabase_versions.pop(); });
  rejects((e) => { e.supabaseReport.snapshot.supabase_versions.push(e.supabaseReport.snapshot.supabase_versions[0]); });
  rejects((e) => { e.supabaseReport.snapshot.drizzle_ledger.pop(); });
  rejects((e) => { e.supabaseReport.snapshot.drizzle_ledger.reverse(); });
  rejects((e) => { e.supabaseReport.snapshot.drizzle_ledger[0].hash = "f".repeat(64); });
  rejects((e) => { e.supabaseReport.snapshot.drizzle_ledger[0].created_at = "1"; });
  rejects((e) => { e.supabaseReport.replay.supabase_count--; });
  rejects((e) => { e.supabaseReport.replay.drizzle_count--; });
});

test("old, future, malformed and out-of-order stage timestamps cannot be reused", () => {
  rejects((e) => { e.staticReport.created_at = e.context.startedAt - 1; });
  rejects((e) => { e.nativeReport.started_at = e.staticReport.created_at - 1; });
  rejects((e) => { e.nativeReport.completed_at = e.nativeReport.started_at - 1; });
  rejects((e) => { e.nativeCleanup.cleanup.verified_at = e.nativeReport.completed_at - 1; });
  rejects((e) => { e.nativeCleanup.cleanup.verified_at = e.supabaseReport.prepared_at + 1; });
  rejects((e) => { e.nativeCleanup.cleanup.verified_at = Date.now() + 24 * 60 * 60 * 1_000; });
  rejects((e) => { e.supabaseReport.prepared_at = e.nativeReport.completed_at - 1; });
  rejects((e) => { e.supabaseReport.collected_at = e.supabaseReport.prepared_at - 1; });
  rejects((e) => { e.supabaseCleanup.verified_at = e.supabaseReport.collected_at - 1; });
  rejects((e) => { e.supabaseCleanup.verified_at = Date.now() + 120_000; });
  for (const value of [undefined, "123", NaN, 0]) rejects((e) => { e.supabaseReport.prepared_at = value; });
});

test("catalog identity stays PostgreSQL 17 read-only over the owned local socket", () => {
  for (const mutation of [{ database: "production" }, { data_directory: "/other/data" }, { server_address: "127.0.0.1" },
    { server_version_num: 160000 }, { current_user: "other" }, { session_user: "other" }, { transaction_read_only: "off" }]) {
    rejects((e) => { Object.assign(e.supabaseReport.snapshot.identity, mutation); });
  }
  rejects((e) => { e.supabaseReport.snapshot.auth_schema.users_present = false; });
  rejects((e) => { e.supabaseReport.snapshot.auth_schema.uid_present = false; });
});

test("reused containers, wrong images and unowned data volumes cannot establish the baseline", () => {
  for (const mutation of [{ id: "short" }, { name: "supabase_db_another_project" }, { image: "other/postgres:17" },
    { created_at: new Date(START - 1).toISOString() }, { started_at: new Date(START - 1).toISOString() },
    { volume_created_at: new Date(START - 1).toISOString() }, { volume: "supabase_db_other" }, { data_mount: "/different/data" }]) {
    rejects((e) => { Object.assign(e.supabaseReport.owned, mutation); });
  }
});

test("claimed PASS cannot omit negative boolean fields or inheritance evidence", () => {
  for (const key of ["superuser", "bypass_rls", "create_role", "create_database", "replication", "inherit", "login"]) {
    rejects((e) => { delete e.supabaseReport.snapshot.roles[0][key]; });
  }
  rejects((e) => { delete e.supabaseReport.snapshot.tables[0].rls_forced; });
  rejects((e) => { delete e.supabaseReport.snapshot.effective_privileges[0].allowed; });
  rejects((e) => { delete e.supabaseReport.snapshot.inheritance; });
  rejects((e) => { e.supabaseReport.snapshot.inheritance.push({ child_schema: "public", child_name: TARGET_TABLES[1], parent_schema: "public", parent_name: "exposed_parent", child_is_partition: false }); });
  rejects((e) => { e.supabaseReport.snapshot.policies[0].roles_public_only = false; });
});

test("recomputed catalog rejects a claimed PASS with missing or changed contracts", () => {
  const mutations = [
    (s) => { s.tables.pop(); },
    (s) => { s.tables[0].rls_enabled = false; },
    (s) => { s.tables[0].rls_forced = true; },
    (s) => { s.policies.push({ ...s.policies[0], table: TARGET_TABLES[0] }); },
    (s) => { s.policies[0].using_false = false; },
    (s) => { s.policies[0].check_false = false; },
    (s) => { s.policies.push({ ...s.policies[0], roles: ["authenticated"], using_false: false }); },
    (s) => { s.table_acl.push({ table: TARGET_TABLES[1], grantee: "PUBLIC", privilege: "TRUNCATE" }); },
    (s) => { s.effective_privileges.find((p) => p.table === TARGET_TABLES[2] && p.role === "authenticated" && p.scope === "table" && p.privilege === "TRUNCATE").allowed = true; },
    (s) => { s.role_reachability.push({ from_role: "anon", reachable_role: "postgres", usage: true, set_role: false }); },
    (s) => { s.roles.find((r) => r.name === "anon").bypass_rls = true; },
    (s) => { s.roles.find((r) => r.name === "service_role").bypass_rls = false; },
  ];
  for (const mutate of mutations) rejects((e) => { mutate(e.supabaseReport.snapshot); e.supabaseReport.status = "PASS"; });
});

test("native controls are complete, unique and checked from their snapshots", () => {
  rejects((e) => { e.nativeReport.scenarios.pop(); });
  rejects((e) => { e.nativeReport.scenarios[1] = e.nativeReport.scenarios[0]; });
  rejects((e) => { e.nativeReport.scenarios[1].snapshot = snapshotFixture(); });
  rejects((e) => { e.nativeReport.scenarios[1].detected_codes = []; });
  rejects((e) => { e.nativeReport.scenarios[1].real_postgresql = false; });
  rejects((e) => { e.nativeReport.restored_baselines.pop(); });
  rejects((e) => { e.nativeReport.restored_baselines[0].snapshot.tables[0].rls_enabled = false; });
});

test("cleanup status, ownership, stop, removal and nonce are mandatory", () => {
  for (const field of ["status", "ownership_verified", "stop_attempted", "stop_command_failed", "project_resources_remaining"]) {
    rejects((e) => { e.supabaseCleanup[field] = field === "status" ? "FAIL" : !e.supabaseCleanup[field]; });
  }
  rejects((e) => { e.supabaseCleanup.nonce = NONCE_NATIVE; });
  rejects((e) => { e.nativeReport.cleanup.status = "FAIL"; });
  rejects((e) => { e.nativeReport.cleanup.disposition = "no_owned_cluster_state"; });
  rejects((e) => { e.nativeReport.cleanup.stopped = false; });
  rejects((e) => { e.nativeReport.cleanup.removed = false; });
  rejects((e) => { e.nativeCleanup.cleanup.stopped = false; });
  rejects((e) => { e.nativeCleanup.cleanup.removed = false; });
  rejects((e) => { e.nativeCleanup.nonce = NONCE_SUPABASE; });
});
