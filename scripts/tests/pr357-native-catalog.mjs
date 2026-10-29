import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditTemporaryCatalog } from "./pr357-catalog-audit.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATABASE = "pr357_catalog_validation";
const TEMPLATE = "pr357_catalog_template";
const STATE_NAME = ".liftgo-pr357-native-state.json";
const PURPOSE = "pr357-native-catalog";
const CHILD_ENV = { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC" };
const REPORT = join(ROOT, "reports/pr357-native-catalog.json");
const CLEANUP_REPORT = join(ROOT, "reports/pr357-native-catalog-cleanup.json");

function ownRegularFile(path) {
  const stat = lstatSync(path);
  return stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0;
}

function invocation(env) {
  const sourceHead = execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: ROOT, encoding: "utf8", env: CHILD_ENV }).trim();
  if (!/^[0-9a-f]{40}$/.test(sourceHead)) throw new Error("Source HEAD is not a full Git commit");
  if (env.GITHUB_ACTIONS === "true") {
    if (env.CI !== "true" || env.RUNNER_ENVIRONMENT !== "github-hosted"
        || env.GITHUB_REPOSITORY !== "hlopezb83/liftgo" || env.PR357_EXPECTED_SHA !== sourceHead
        || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")
        || !["pull_request", "push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)
        || !env.GITHUB_JOB || !env.GITHUB_WORKSPACE || realpathSync(env.GITHUB_WORKSPACE) !== realpathSync(ROOT)) {
      throw new Error("Native CI evidence requires this exact hosted checkout, run and attempt");
    }
  }
  return { sourceHead, run: { id: env.GITHUB_RUN_ID ?? "local", attempt: env.GITHUB_RUN_ATTEMPT ?? "local", job: env.GITHUB_JOB ?? "local" } };
}

export function nativeEvidenceBinding(settings, nonce) {
  return { schema_version: 2, producer: "pr357-native-catalog", checkout_sha: settings.sourceHead,
    run_id: settings.run.id, run_attempt: settings.run.attempt, job: settings.run.job, nonce };
}

export function launcherSettings(env = process.env) {
  if (env.RUN_PR357_NATIVE_CATALOG !== "1") throw new Error("Opt in with RUN_PR357_NATIVE_CATALOG=1");
  for (const [key, value] of Object.entries(env)) {
    if (value && ((key.startsWith("PG") && key !== "PG_BIN")
      || ["DATABASE_URL", "DB_URL", "POSTGRES_URL", "SUPABASE_DB_URL", "PR357_NATIVE_DB_URL", "PR357_NATIVE_PORT"].includes(key))) {
      throw new Error("Existing database connection settings are not accepted");
    }
  }
  const runnerTemporary = env.RUNNER_TEMP ?? tmpdir();
  if (!isAbsolute(runnerTemporary) || realpathSync(runnerTemporary) !== resolve(runnerTemporary)
      || !lstatSync(runnerTemporary).isDirectory()) throw new Error("RUNNER_TEMP must be an existing real directory");
  return { runnerTemporary, statePath: join(runnerTemporary, STATE_NAME), ...invocation(env) };
}

export function trustedBinaries(bin) {
  if (typeof bin !== "string" || !isAbsolute(bin) || !/^[A-Za-z0-9_./-]+$/.test(bin)
      || realpathSync(bin) !== resolve(bin) || !lstatSync(bin).isDirectory()) {
    throw new Error("PG_BIN must be a real absolute installed PostgreSQL 17 binary directory");
  }
  for (const name of ["postgres", "initdb", "pg_ctl"]) {
    const stat = lstatSync(join(bin, name));
    if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111)) throw new Error("PostgreSQL binary is missing or not regular/executable");
  }
  const version = execFileSync(join(bin, "postgres"), ["--version"], { encoding: "utf8", env: CHILD_ENV, timeout: 10000 }).trim();
  if (!/^postgres \(PostgreSQL\) 17(?:\.|\s|$)/.test(version)) throw new Error("Only PostgreSQL major 17 is supported");
  return { bin: resolve(bin), version };
}

function pg(state, name, args, timeout = 40000) {
  return execFileSync(join(state.pgBin, name), args, { encoding: "utf8", env: CHILD_ENV, timeout, stdio: ["ignore", "pipe", "pipe"] });
}

function writeJson(path, value) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  if (!lstatSync(directory).isDirectory() || realpathSync(directory) !== directory) throw new Error("Report directory must not be a symlink");
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

export function validateOwnedState(state, settings) {
  assert.equal(state.purpose, PURPOSE, "Unexpected cleanup state purpose");
  assert.equal(state.sourceHead, settings.sourceHead, "Cleanup source HEAD mismatch");
  assert.deepEqual(state.run, settings.run, "Cleanup workflow run mismatch");
  assert.match(state.nonce, /^[0-9a-f-]{36}$/i, "Cleanup nonce missing");
  const directory = state.clusterDirectory;
  assert.equal(dirname(directory), realpathSync(tmpdir()), "Cluster must be directly under the system temporary directory");
  assert.match(basename(directory), /^liftgo-pr357-pg-[A-Za-z0-9_-]+$/);
  assert.equal(realpathSync(directory), directory, "Cluster must not be a symlink");
  const stat = lstatSync(directory);
  assert(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, "Cluster is not privately owned");
  const markerPath = join(directory, ".liftgo-pr357-temporary.json");
  assert(ownRegularFile(markerPath), "Cluster marker is not a private regular file");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.deepEqual(marker, { purpose: "pr357-catalog-validation", nonce: state.nonce, sourceHead: state.sourceHead, run: state.run }, "Cluster marker mismatch");
  return state;
}

function exitStatus(error) {
  return Number.isInteger(error.status) ? error.status : null;
}

export function cleanupNativeCatalog(settings, env = process.env) {
  if (!existsSync(settings.statePath)) return { status: "PASS", disposition: "no_owned_cluster_state", stopped: true, removed: true };
  if (!ownRegularFile(settings.statePath)) throw new Error("Cleanup state must be a private regular file owned by this user");
  const state = validateOwnedState(JSON.parse(readFileSync(settings.statePath, "utf8")), settings);
  const trusted = trustedBinaries(env.PG_BIN);
  assert.equal(trusted.bin, state.pgBin, "Cleanup PostgreSQL binary directory mismatch");
  let running = false;
  if (state.startAttempted) {
    try { pg(state, "pg_ctl", ["-D", join(state.clusterDirectory, "data"), "status"]); running = true; }
    catch (error) { if (exitStatus(error) !== 3) throw new Error("Cannot establish owned PostgreSQL process status"); }
    if (running) pg(state, "pg_ctl", ["-D", join(state.clusterDirectory, "data"), "-m", "immediate", "-w", "-t", "30", "stop"]);
    try {
      pg(state, "pg_ctl", ["-D", join(state.clusterDirectory, "data"), "status"]);
      throw new Error("Owned PostgreSQL process still runs after cleanup");
    } catch (error) { if (exitStatus(error) !== 3) throw new Error("Owned PostgreSQL shutdown could not be verified"); }
  }
  // Recheck ownership immediately before removing only this harness's directory.
  validateOwnedState(state, settings);
  rmSync(state.clusterDirectory, { recursive: true, force: false });
  rmSync(settings.statePath);
  return { status: "PASS", disposition: state.startAttempted ? "owned_cluster_stopped_and_removed" : "cluster_never_started_and_removed", stopped: true, removed: true };
}

const ROLE_FIXTURE = `
  CREATE ROLE anon NOLOGIN INHERIT NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE authenticated NOLOGIN INHERIT NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE service_role NOLOGIN INHERIT NOSUPERUSER NOCREATEROLE NOREPLICATION BYPASSRLS;
  CREATE ROLE pr357_grant_parent NOLOGIN INHERIT NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE pr357_bridge NOLOGIN INHERIT NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
`;
const TABLE_FIXTURE = `
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, pr357_grant_parent, pr357_bridge;
  CREATE TABLE public.organization_document_counters (id integer PRIMARY KEY, marker text NOT NULL);
  CREATE TABLE public.storage_object_migrations (id integer PRIMARY KEY, marker text NOT NULL);
  CREATE TABLE public.storage_reference_migrations (id integer PRIMARY KEY, marker text NOT NULL);
  INSERT INTO public.organization_document_counters VALUES (1,'synthetic-counter');
  INSERT INTO public.storage_object_migrations VALUES (1,'synthetic-object');
  INSERT INTO public.storage_reference_migrations VALUES (1,'synthetic-reference');
  ALTER TABLE public.organization_document_counters ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.storage_object_migrations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.storage_reference_migrations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.organization_document_counters, public.storage_object_migrations, public.storage_reference_migrations FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.organization_document_counters TO service_role;
  CREATE POLICY synthetic_deny_objects ON public.storage_object_migrations FOR ALL TO PUBLIC USING(false) WITH CHECK(false);
  CREATE POLICY synthetic_deny_references ON public.storage_reference_migrations FOR ALL TO PUBLIC USING(false) WITH CHECK(false);
`;
const RESET_ROLES = `
  REVOKE pr357_grant_parent, pr357_bridge FROM anon, authenticated;
  REVOKE postgres, pr357_grant_parent FROM pr357_bridge;
  ALTER ROLE service_role BYPASSRLS;
  ALTER ROLE anon NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ALTER ROLE authenticated NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ALTER ROLE pr357_bridge NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS;
`;

// Mutations touch only synthetic objects/roles in the newly initialized cluster.
// Every case receives a fresh database clone; role-level changes are restored.
export const NATIVE_SCENARIOS = Object.freeze([
  { name: "baseline", mutation: null, expected: [] },
  { name: "counters_rls_disabled", mutation: "ALTER TABLE public.organization_document_counters DISABLE ROW LEVEL SECURITY", expected: ["RLS_DISABLED"] },
  { name: "object_ledger_rls_disabled", mutation: "ALTER TABLE public.storage_object_migrations DISABLE ROW LEVEL SECURITY", expected: ["RLS_DISABLED"] },
  { name: "reference_ledger_rls_disabled", mutation: "ALTER TABLE public.storage_reference_migrations DISABLE ROW LEVEL SECURITY", expected: ["RLS_DISABLED"] },
  { name: "counter_policy_added", mutation: "CREATE POLICY synthetic_counter_leak ON public.organization_document_counters FOR SELECT TO authenticated USING(true)", expected: ["COUNTERS_POLICY_PRESENT"] },
  { name: "object_ledger_policy_added", mutation: "CREATE POLICY synthetic_object_leak ON public.storage_object_migrations FOR SELECT TO authenticated USING(true)", expected: ["UNREVIEWED_LEDGER_POLICY"] },
  { name: "reference_ledger_policy_added", mutation: "CREATE POLICY synthetic_reference_leak ON public.storage_reference_migrations FOR SELECT TO authenticated USING(true)", expected: ["UNREVIEWED_LEDGER_POLICY"] },
  { name: "public_table_grant", mutation: "GRANT SELECT ON public.storage_object_migrations TO PUBLIC", expected: ["PUBLIC_ACL_PRESENT", "PRODUCT_PRIVILEGE_PRESENT"] },
  { name: "public_column_grant", mutation: "GRANT SELECT(marker) ON public.storage_reference_migrations TO PUBLIC", expected: ["PUBLIC_ACL_PRESENT", "PRODUCT_PRIVILEGE_PRESENT"] },
  { name: "inherited_table_grant", mutation: "GRANT SELECT ON public.storage_object_migrations TO pr357_grant_parent; GRANT pr357_grant_parent TO authenticated WITH INHERIT TRUE, SET FALSE", expected: ["PRODUCT_PRIVILEGE_PRESENT"] },
  { name: "set_role_inherited_owner", mutation: "GRANT postgres TO pr357_bridge WITH INHERIT TRUE, SET FALSE; GRANT pr357_bridge TO authenticated WITH INHERIT FALSE, SET TRUE", expected: ["PRODUCT_BYPASS_REACHABLE"] },
  { name: "set_role_inherited_acl", mutation: "GRANT TRUNCATE ON public.storage_reference_migrations TO pr357_grant_parent; GRANT pr357_grant_parent TO pr357_bridge WITH INHERIT TRUE, SET FALSE; GRANT pr357_bridge TO authenticated WITH INHERIT FALSE, SET TRUE", expected: ["PRODUCT_PRIVILEGE_PRESENT"] },
  { name: "service_without_bypass", mutation: "ALTER ROLE service_role NOBYPASSRLS", expected: ["COUNTERS_SERVICE_BYPASS_MISSING"] },
  { name: "product_non_rls_privilege", mutation: "GRANT TRUNCATE ON public.storage_object_migrations TO authenticated", expected: ["PRODUCT_PRIVILEGE_PRESENT"] },
  { name: "inherited_relation_exposure", mutation: "CREATE TABLE public.synthetic_exposed_parent (id integer, marker text); GRANT SELECT ON public.synthetic_exposed_parent TO authenticated; ALTER TABLE public.storage_object_migrations INHERIT public.synthetic_exposed_parent", expected: ["INHERITANCE_EDGE_PRESENT"] },
]);

export function assertScenarioResult(scenario, result) {
  const codes = new Set(result.findings.map((finding) => finding.code));
  if (scenario.expected.length === 0) {
    if (result.status !== "PASS" || codes.size !== 0) throw new Error("Synthetic baseline failed catalog contract");
  } else if (result.status !== "FAIL" || !scenario.expected.every((code) => codes.has(code))) {
    throw new Error("Synthetic negative control was not detected");
  }
  return [...codes].sort();
}

function safeError(error) {
  return { category: error?.name ?? "Error", sqlstate: typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null,
    position: typeof error?.position === "string" && /^\d+$/.test(error.position) ? error.position : null };
}

export async function runNativeCatalog(env = process.env) {
  const settings = launcherSettings(env);
  const trusted = trustedBinaries(env.PG_BIN);
  if (existsSync(settings.statePath)) throw new Error("Owned cluster state already exists; run the cleanup command first");
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "liftgo-pr357-pg-"));
  const state = { purpose: PURPOSE, ...settings, pgBin: trusted.bin, clusterDirectory: directory, nonce: randomUUID(), startAttempted: false };
  try {
    writeFileSync(join(directory, ".liftgo-pr357-temporary.json"), JSON.stringify({ purpose: "pr357-catalog-validation", nonce: state.nonce, sourceHead: state.sourceHead, run: state.run }), { mode: 0o600, flag: "wx" });
    writeFileSync(settings.statePath, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  } catch (error) {
    // No process can have been started before state initialization completes.
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  const report = { ...nativeEvidenceBinding(settings, state.nonce), status: "RUNNING", source_head: settings.sourceHead,
    started_at: Date.now(), postgresql_version: trusted.version,
    scope: "Real PostgreSQL 17 catalog queries against synthetic native fixtures; not a Supabase migration replay",
    scenarios: [], restored_baselines: [], cleanup: { status: "PENDING" } };
  let admin;
  let active;
  let failure;
  const onSignal = (signal) => {
    report.status = "FAIL";
    report.interrupted_by = signal;
    try { report.cleanup = { ...cleanupNativeCatalog(settings, env), nonce: state.nonce, verified_at: Date.now() }; }
    catch (error) { report.cleanup = { status: "FAIL", error: safeError(error) }; }
    writeJson(REPORT, report);
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  const interrupt = () => onSignal("SIGINT");
  const terminate = () => onSignal("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    report.stage = "initialize_private_cluster";
    writeJson(REPORT, report);
    pg(state, "initdb", ["-D", join(directory, "data"), "-U", "postgres", "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
    const socket = join(directory, "socket");
    mkdirSync(socket, { mode: 0o700 });
    if (!/^[A-Za-z0-9_./-]+$/.test(socket)) throw new Error("Unsafe generated socket directory");
    state.startAttempted = true;
    writeJson(settings.statePath, state);
    pg(state, "pg_ctl", ["-D", join(directory, "data"), "-p", join(state.pgBin, "postgres"), "-l", join(directory, "postgres.log"), "-o", `-h '' -p 5432 -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`, "-w", "-t", "30", "start"]);
    const { default: postgres } = await import("postgres");
    const connect = (database) => postgres({ host: socket, port: 5432, username: "postgres", database,
      max: 1, prepare: false, connect_timeout: 10, onnotice: () => {}, connection: { statement_timeout: "10000", lock_timeout: "5000" } });
    admin = connect("postgres");
    report.stage = "create_synthetic_fixtures";
    await admin.unsafe(ROLE_FIXTURE);
    await admin.unsafe(`CREATE DATABASE ${TEMPLATE} TEMPLATE template0`);
    active = connect(TEMPLATE);
    await active.unsafe(TABLE_FIXTURE);
    await active.end({ timeout: 5 }); active = null;
    await admin.unsafe(`ALTER DATABASE ${TEMPLATE} ALLOW_CONNECTIONS false`);
    const auditOptions = { clusterDirectory: directory, nonce: state.nonce };
    async function withFreshDatabase(callback) {
      await admin.unsafe(`CREATE DATABASE ${DATABASE} TEMPLATE ${TEMPLATE}`);
      active = connect(DATABASE);
      try { return await callback(active); }
      finally {
        if (active) { await active.end({ timeout: 5 }); active = null; }
        await admin.unsafe(`DROP DATABASE ${DATABASE} WITH (FORCE)`);
        await admin.begin(async (tx) => tx.unsafe(RESET_ROLES));
      }
    }
    for (const scenario of NATIVE_SCENARIOS) {
      report.stage = "catalog_scenario";
      report.current_scenario = scenario.name;
      writeJson(REPORT, report);
      const result = await withFreshDatabase(async (sql) => {
        if (scenario.mutation) await sql.begin(async (tx) => tx.unsafe(scenario.mutation));
        return auditTemporaryCatalog(sql, auditOptions);
      });
      const detected = assertScenarioResult(scenario, result);
      report.scenarios.push({ name: scenario.name, status: "PASS", expected_audit_status: scenario.expected.length ? "FAIL" : "PASS",
        actual_audit_status: result.status, detected_codes: detected, real_postgresql: true, snapshot: result.snapshot });
      if (scenario.name === "baseline") report.baseline_snapshot = result.snapshot;
      // Check actual restored role state and fresh table state after every case.
      const restored = await withFreshDatabase((sql) => auditTemporaryCatalog(sql, auditOptions));
      assertScenarioResult(NATIVE_SCENARIOS[0], restored);
      report.restored_baselines.push({ after: scenario.name, status: "PASS", real_postgresql: true, snapshot: restored.snapshot });
      writeJson(REPORT, report);
    }
    report.stage = "completed";
    delete report.current_scenario;
    report.status = "PASS";
  } catch (error) {
    failure = error;
    report.status = "FAIL";
    report.error = safeError(error);
  } finally {
    try { if (active) await active.end({ timeout: 5 }); } catch { /* Stop below remains authoritative. */ }
    try { if (admin) await admin.end({ timeout: 5 }); } catch { /* Stop below remains authoritative. */ }
    try { report.cleanup = { ...cleanupNativeCatalog(settings, env), nonce: state.nonce, verified_at: Date.now() }; }
    catch (error) { report.cleanup = { status: "FAIL", error: safeError(error) }; report.status = "FAIL"; failure ??= error; }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    report.completed_at = Date.now();
    writeJson(REPORT, report);
  }
  if (failure) throw new Error("Native catalog validation failed; inspect the safe JSON report");
  return report;
}

export function updatedCleanupReport(report, cleanup) {
  const preserveOriginal = report.cleanup?.status === "PASS"
    && report.cleanup.disposition === "owned_cluster_stopped_and_removed"
    && cleanup.disposition === "no_owned_cluster_state";
  return { ...report, status: report.status === "RUNNING" ? "FAIL" : report.status,
    cleanup: preserveOriginal ? report.cleanup : cleanup, cleanup_followup: cleanup };
}

export function cleanupCommand(env = process.env) {
  const settings = launcherSettings(env);
  const cleanup = cleanupNativeCatalog(settings, env);
  let report;
  if (existsSync(REPORT)) {
    report = JSON.parse(readFileSync(REPORT, "utf8"));
    if (report.source_head !== settings.sourceHead || report.checkout_sha !== settings.sourceHead
        || report.run_id !== settings.run.id || report.run_attempt !== settings.run.attempt || report.job !== settings.run.job
        || !/^[0-9a-f-]{36}$/i.test(report.nonce ?? "")) {
      throw new Error("Native cleanup report differs from this exact invocation");
    }
  }
  const verified = { ...cleanup, nonce: report?.nonce ?? null, verified_at: Date.now() };
  writeJson(CLEANUP_REPORT, { ...nativeEvidenceBinding(settings, report?.nonce ?? null), source_head: settings.sourceHead, cleanup: verified });
  if (report) writeJson(REPORT, updatedCleanupReport(report, verified));
  return verified;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 3 || (process.argv[2] && !["run", "cleanup"].includes(process.argv[2]))) throw new Error("Only run or cleanup commands are accepted");
    const result = process.argv[2] === "cleanup" ? cleanupCommand() : await runNativeCatalog();
    console.log(JSON.stringify({ status: result.status, scenarios: result.scenarios?.length, cleanup: result.cleanup ?? result }));
  } catch (error) {
    console.error(JSON.stringify({ status: "FAIL", error: safeError(error) }));
    process.exitCode = 1;
  }
}
