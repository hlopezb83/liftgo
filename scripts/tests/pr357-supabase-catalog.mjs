import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { CATALOG_IDENTITY_SQL, CATALOG_QUERIES, evaluateCatalog } from "./pr357-catalog-audit.mjs";
import { assertReplayLedger, validateReplay } from "../ci-drizzle-replay.mjs";

const PURPOSE = "pr357-owned-supabase-replay";
const IMAGE = "public.ecr.aws/supabase/postgres:17.4.1.068";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function command(executable, args, options = {}) {
  try {
    const actualArgs = executable === "docker" ? ["--host", "unix:///var/run/docker.sock", ...args] : args;
    return execFileSync(executable, actualArgs, { encoding: "utf8", timeout: 180_000,
      maxBuffer: 20 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options });
  } catch (error) {
    // Never emit command output: docker inspect can contain service secrets.
    const sqlstate = /(?:ERROR:|FATAL:)\s+([0-9A-Z]{5})/.exec(String(error.stderr ?? ""))?.[1];
    throw new Error(`${executable} failed (exit ${error.status ?? "unknown"}${sqlstate ? `, SQLSTATE ${sqlstate}` : ""})`);
  }
}

function regularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Expected regular non-symlink input file");
  return readFileSync(path);
}

function projectId(root) {
  const result = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(regularFile(join(root, "supabase/config.toml")).toString("utf8"));
  if (!result) throw new Error("Unsupported Supabase local project_id");
  return result[1];
}

export function requireCiContext({ env = process.env, root = process.cwd(), run = command } = {}) {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || env.RUNNER_ENVIRONMENT !== "github-hosted"
      || env.GITHUB_REPOSITORY !== "hlopezb83/liftgo" || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")
      || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "") || !/^[0-9a-f]{40}$/.test(env.PR357_EXPECTED_SHA ?? "")
      || !["pull_request", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error("Explicit GitHub-hosted CI run and exact expected checkout SHA required");
  }
  if ((env.DOCKER_HOST && env.DOCKER_HOST !== "unix:///var/run/docker.sock")
      || (env.DOCKER_CONTEXT && env.DOCKER_CONTEXT !== "default")
      || env.DOCKER_TLS_VERIFY || env.DOCKER_CERT_PATH
      || (env.SUPABASE_INTERNAL_IMAGE_REGISTRY && env.SUPABASE_INTERNAL_IMAGE_REGISTRY !== "public.ecr.aws")) {
    throw new Error("Only the runner-local Docker socket and existing Supabase registry are supported");
  }
  const workspace = realpathSync(root);
  if (workspace !== resolve(root) || realpathSync(env.GITHUB_WORKSPACE ?? "") !== workspace) {
    throw new Error("Checkout must be the GitHub Actions workspace");
  }
  const actualSha = run("git", ["rev-parse", "HEAD"], { cwd: workspace }).trim();
  if (actualSha !== env.PR357_EXPECTED_SHA) throw new Error("Checkout differs from the expected workflow SHA");
  const runnerTemp = realpathSync(env.RUNNER_TEMP ?? "");
  if (!lstatSync(runnerTemp).isDirectory() || lstatSync(runnerTemp).uid !== process.getuid()) {
    throw new Error("Runner temp directory must be local and owned by this runner");
  }
  return { workspace, runnerTemp, sha: actualSha, runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT, projectId: projectId(workspace) };
}

const lines = (value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function assertPristine(project, volumes, containers, networks = []) {
  const belongs = (name) => name.startsWith("supabase_") && name.endsWith(`_${project}`);
  if (volumes.some(belongs) || containers.some(belongs) || networks.some(belongs)) {
    throw new Error("Supabase project has pre-existing containers, volumes or networks");
  }
}

function inventory(run, cwd) {
  return {
    volumes: lines(run("docker", ["volume", "ls", "--format", "{{.Name}}"], { cwd })),
    containers: lines(run("docker", ["ps", "-a", "--format", "{{.Names}}"], { cwd })),
    networks: lines(run("docker", ["network", "ls", "--format", "{{.Name}}"], { cwd })),
  };
}

function sqlManifest(root, directory) {
  return readdirSync(join(root, directory)).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => ({ path: `${directory}/${name}`, sha256: sha256(regularFile(join(root, directory, name))) }));
}

function expectedLegacyPatch(root, stateDirectory, source, run) {
  const temporary = mkdtempSync(join(stateDirectory, "predict-legacy-"));
  try {
    mkdirSync(join(temporary, "supabase/migrations"), { recursive: true });
    for (const entry of source) copyFileSync(join(root, entry.path), join(temporary, entry.path));
    // Same existing patcher as RLS CI, applied only to a temporary copy.
    run("python3", [join(root, "scripts/patch_legacy_migrations.py")], { cwd: temporary });
    return sqlManifest(temporary, "supabase/migrations");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function stateDirectory(context) {
  return join(context.runnerTemp, `liftgo-pr357-supabase-${context.runId}-${context.attempt}`);
}

function readState(context) {
  const directory = stateDirectory(context);
  const file = join(directory, "ownership.json");
  for (const path of [directory, file]) {
    const stat = lstatSync(path);
    if (realpathSync(path) !== path || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
      throw new Error("Ownership marker must be private, local and owned by this runner");
    }
  }
  const state = JSON.parse(regularFile(file).toString("utf8"));
  if (state.purpose !== PURPOSE || state.workspace !== context.workspace || state.sha !== context.sha
      || state.runId !== context.runId || state.attempt !== context.attempt || state.projectId !== context.projectId
      || !/^[0-9a-f-]{36}$/.test(state.nonce ?? "") || !Number.isFinite(state.preparedAt)) {
    throw new Error("Ownership marker does not match this exact CI checkout and attempt");
  }
  return state;
}

export function prepareSupabase({ env = process.env, root = process.cwd(), run = command } = {}) {
  const context = requireCiContext({ env, root, run });
  const observed = inventory(run, context.workspace);
  assertPristine(context.projectId, observed.volumes, observed.containers, observed.networks);
  const labelled = lines(run("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${context.projectId}`, "--format", "{{.ID}}"], { cwd: context.workspace }));
  if (labelled.length) throw new Error("Supabase project label already exists on this runner");
  run("git", ["diff", "--quiet", "HEAD", "--", "supabase/migrations", "drizzle/migrations", "supabase/config.toml", "scripts/patch_legacy_migrations.py", "scripts/ci-drizzle-replay.mjs"], { cwd: context.workspace });
  const supabaseSource = sqlManifest(context.workspace, "supabase/migrations");
  const drizzleSource = sqlManifest(context.workspace, "drizzle/migrations");
  const trackedSql = lines(run("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", "supabase/migrations", "drizzle/migrations"], { cwd: context.workspace }))
    .filter((path) => path.endsWith(".sql")).sort();
  const actualSql = [...supabaseSource, ...drizzleSource].map(({ path }) => path).sort();
  if (!isDeepStrictEqual(actualSql, trackedSql)) throw new Error("Migration SQL file inventory differs from the exact checkout tree");
  const directory = stateDirectory(context);
  mkdirSync(directory, { mode: 0o700 }); // Existing marker is never reused.
  const state = { ...context, purpose: PURPOSE, nonce: randomUUID(), preparedAt: Date.now(),
    supabaseSource, expectedPatchedSupabase: expectedLegacyPatch(context.workspace, directory, supabaseSource, run),
    drizzleSource,
    patcherSha256: sha256(regularFile(join(context.workspace, "scripts/patch_legacy_migrations.py"))),
    replayGuardSha256: sha256(regularFile(join(context.workspace, "scripts/ci-drizzle-replay.mjs"))),
    drizzleJournalSha256: sha256(regularFile(join(context.workspace, "drizzle/migrations/meta/_journal.json"))) };
  writeFileSync(join(directory, "ownership.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return { status: "PREPARED", checkout_sha: context.sha, source_counts: {
    supabase: state.supabaseSource.length, drizzle: state.drizzleSource.length } };
}

export function validateDockerIdentity(state, container, volume) {
  const expectedName = `supabase_db_${state.projectId}`;
  const created = Date.parse(container.Created);
  const started = Date.parse(container.State?.StartedAt);
  const volumeCreated = Date.parse(volume.CreatedAt);
  if (!/^[0-9a-f]{64}$/.test(container.Id ?? "") || container.Name !== `/${expectedName}`
      || container.Config?.Labels?.["com.supabase.cli.project"] !== state.projectId
      || container.Config?.Image !== IMAGE || container.State?.Running !== true
      || !Number.isFinite(created) || created < state.preparedAt
      || !Number.isFinite(started) || started < state.preparedAt) {
    throw new Error("Database container is not the fresh pinned Supabase instance owned by this attempt");
  }
  const mounts = container.Mounts?.filter((mount) => mount.Type === "volume" && mount.Name === expectedName && mount.RW);
  if (mounts?.length !== 1 || !/^\/[A-Za-z0-9_/-]+$/.test(mounts[0].Destination)
      || volume.Name !== expectedName || !Number.isFinite(volumeCreated)
      || volumeCreated < Math.floor(state.preparedAt / 1000) * 1000) {
    throw new Error("Database data volume is not the fresh writable volume prepared for this attempt");
  }
  return { id: container.Id, name: expectedName, image: IMAGE, created_at: container.Created,
    started_at: container.State.StartedAt, data_mount: mounts[0].Destination, volume: volume.Name,
    volume_created_at: volume.CreatedAt };
}

export function buildSnapshotSql() {
  const queries = { identity: { query: CATALOG_IDENTITY_SQL, one: true },
    ...Object.fromEntries(Object.entries(CATALOG_QUERIES).map(([key, query]) => [key, { query }])),
    supabase_versions: { query: "SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version" },
    drizzle_ledger: { query: "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id" },
    auth_schema: { query: "SELECT to_regclass('auth.users') IS NOT NULL AS users_present, to_regprocedure('auth.uid()') IS NOT NULL AS uid_present", one: true } };
  const fields = Object.entries(queries).map(([key, { query, one }]) =>
    `'${key}', (SELECT ${one ? "row_to_json(q)" : "COALESCE(json_agg(q), '[]'::json)"} FROM (${query}) q)`);
  return `\\set VERBOSITY sqlstate\nBEGIN READ ONLY;\nSELECT json_build_object(${fields.join(",\n")});\nROLLBACK;\n`;
}

export function verifySupabaseVersions(source, applied) {
  const expected = source.map(({ path }) => /\/(\d+)_[^/]+\.sql$/.exec(path)?.[1]).sort();
  const actual = applied.map(({ version }) => version).sort();
  if (expected.some((v) => !v) || !expected.length || new Set(expected).size !== expected.length
      || new Set(actual).size !== actual.length || !isDeepStrictEqual(expected, actual)) {
    throw new Error("Supabase applied versions differ from the complete source history");
  }
  return actual.length;
}

export function verifySnapshotIdentity(identity, owned) {
  if (identity?.database !== "postgres" || identity.transaction_read_only !== "on"
      || identity.server_address !== null || identity.current_user !== "postgres" || identity.session_user !== "postgres"
      || !Number.isInteger(identity.server_version_num) || identity.server_version_num < 170000 || identity.server_version_num >= 180000
      || !(identity.data_directory === owned.data_mount || identity.data_directory?.startsWith(`${owned.data_mount}/`))) {
    throw new Error("Catalog connection is not the Unix-socket read-only PostgreSQL 17 inside the owned data volume");
  }
}

function writeReport(root, name, report) {
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "reports", name), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

export function verifyCleanupOwnership(state, observed, run, cwd) {
  const belongs = (name) => name.startsWith("supabase_") && name.endsWith(`_${state.projectId}`);
  const containers = observed.containers.filter(belongs);
  const volumes = observed.volumes.filter(belongs);
  const networks = observed.networks.filter(belongs);
  const expectedDb = `supabase_db_${state.projectId}`;
  for (const name of containers) {
    const [container] = JSON.parse(run("docker", ["inspect", name], { cwd }));
    if (container.Name !== `/${name}` || !/^[0-9a-f]{64}$/.test(container.Id ?? "")
        || container.Config?.Labels?.["com.supabase.cli.project"] !== state.projectId
        || !Number.isFinite(Date.parse(container.Created)) || Date.parse(container.Created) < state.preparedAt) {
      throw new Error("Cleanup refused a container whose fresh project ownership is unproven");
    }
    if (name === expectedDb) {
      const mounts = container.Mounts?.filter((m) => m.Type === "volume" && m.Name === expectedDb && m.RW);
      if (container.Config?.Image !== IMAGE || mounts?.length !== 1 || !volumes.includes(expectedDb)) {
        throw new Error("Cleanup refused an unexpected database image or data volume");
      }
    }
  }
  for (const [kind, names, createdField] of [["volume", volumes, "CreatedAt"], ["network", networks, "Created"]]) {
    for (const name of names) {
      const [resource] = JSON.parse(run("docker", [kind, "inspect", name], { cwd }));
      const created = Date.parse(resource[createdField]);
      const label = resource.Labels?.["com.supabase.cli.project"];
      if (resource.Name !== name || !Number.isFinite(created)
          || created < Math.floor(state.preparedAt / 1000) * 1000
          || (label !== undefined && label !== state.projectId)) {
        throw new Error("Cleanup refused a volume or network whose fresh project ownership is unproven");
      }
    }
  }
  return { containers: containers.length, volumes: volumes.length, networks: networks.length };
}

export function collectSupabase({ env = process.env, root = process.cwd(), run = command } = {}) {
  const context = requireCiContext({ env, root, run });
  const state = readState(context);
  if (!isDeepStrictEqual(sqlManifest(context.workspace, "supabase/migrations"), state.expectedPatchedSupabase)
      || !isDeepStrictEqual(sqlManifest(context.workspace, "drizzle/migrations"), state.drizzleSource)
      || sha256(regularFile(join(context.workspace, "scripts/patch_legacy_migrations.py"))) !== state.patcherSha256
      || sha256(regularFile(join(context.workspace, "scripts/ci-drizzle-replay.mjs"))) !== state.replayGuardSha256
      || sha256(regularFile(join(context.workspace, "drizzle/migrations/meta/_journal.json"))) !== state.drizzleJournalSha256) {
    throw new Error("Replay sources differ from the recorded existing CI transformation and canonical history");
  }
  const replay = validateReplay({ env, rootDir: context.workspace });
  const name = `supabase_db_${context.projectId}`;
  const ids = lines(run("docker", ["ps", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"], { cwd: context.workspace }));
  if (ids.length !== 1) throw new Error("Expected exactly one running owned Supabase database container");
  const [container] = JSON.parse(run("docker", ["inspect", name], { cwd: context.workspace }));
  const [volume] = JSON.parse(run("docker", ["volume", "inspect", name], { cwd: context.workspace }));
  const owned = validateDockerIdentity(state, container, volume);
  if (!owned.id.startsWith(ids[0])) throw new Error("Container ID changed during ownership verification");
  const raw = run("docker", ["exec", "-i", owned.id, "psql", "-X", "--no-password", "--quiet", "--no-align", "--tuples-only",
    "--host", "/var/run/postgresql", "--port", "5432", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=1"], {
    cwd: context.workspace, input: buildSnapshotSql() });
  const snapshot = JSON.parse(raw.trim());
  verifySnapshotIdentity(snapshot.identity, owned);
  if (snapshot.auth_schema?.users_present !== true || snapshot.auth_schema?.uid_present !== true) throw new Error("Supabase auth schema is incomplete");
  const supabaseCount = verifySupabaseVersions(state.supabaseSource, snapshot.supabase_versions);
  const drizzleCount = assertReplayLedger(snapshot.drizzle_ledger, replay.entries);
  const result = evaluateCatalog(snapshot);
  const report = { ...result, evidence_scope: "Real read-only catalog after complete existing Supabase/Drizzle CI replay; no business rows queried",
    checkout_sha: context.sha, run_id: context.runId, run_attempt: context.attempt, owned,
    replay: { supabase_count: supabaseCount, drizzle_count: drizzleCount, supabase_source: state.supabaseSource,
      supabase_runner_transformation: state.expectedPatchedSupabase, manifest: replay.manifest }, snapshot };
  writeReport(context.workspace, "pr357-supabase-catalog.json", report);
  return report;
}

export function cleanupSupabase({ env = process.env, root = process.cwd(), run = command, stop = true } = {}) {
  const context = requireCiContext({ env, root, run });
  const state = readState(context);
  const before = inventory(run, context.workspace);
  let owned;
  try { owned = verifyCleanupOwnership(state, before, run, context.workspace); }
  catch (error) {
    writeReport(context.workspace, "pr357-supabase-cleanup.json", { status: "FAIL", checkout_sha: context.sha,
      run_id: context.runId, run_attempt: context.attempt, ownership_verified: false,
      stop_attempted: false, project_resources_remaining: true });
    throw error;
  }
  let stopFailed = false;
  if (stop) {
    try { run("supabase", ["stop", "--no-backup"], { cwd: context.workspace }); }
    catch { stopFailed = true; }
  }
  const observed = inventory(run, context.workspace);
  let resourcesRemaining = false;
  try { assertPristine(context.projectId, observed.volumes, observed.containers, observed.networks); }
  catch { resourcesRemaining = true; }
  const report = { status: stopFailed ? "FAIL" : "PASS", checkout_sha: context.sha,
    run_id: context.runId, run_attempt: context.attempt, project_resources_remaining: resourcesRemaining,
    ownership_verified: true, verified_owned_resources: owned,
    stop_attempted: stop, stop_command_failed: stopFailed };
  if (resourcesRemaining) report.status = "FAIL";
  writeReport(context.workspace, "pr357-supabase-cleanup.json", report);
  if (resourcesRemaining) throw new Error("Supabase project containers or volumes remain after cleanup");
  if (stopFailed) throw new Error("Supabase stop returned failure even though no project resources remain");
  return report;
}

async function main(operation) {
  if (operation === "prepare") {
    console.info(JSON.stringify(prepareSupabase()));
  } else if (operation === "collect") {
    const result = collectSupabase();
    console.info(JSON.stringify({ status: result.status, findings: result.findings.length,
      supabase_migrations: result.replay.supabase_count, drizzle_migrations: result.replay.drizzle_count }));
    if (result.status !== "PASS") process.exitCode = 1;
  } else if (operation === "cleanup" || operation === "cleanup-check") {
    console.info(JSON.stringify(cleanupSupabase({ stop: operation === "cleanup" })));
  } else {
    throw new Error("Usage: node scripts/tests/pr357-supabase-catalog.mjs prepare|collect|cleanup|cleanup-check");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch((error) => {
    // This message is generated locally and never includes raw Docker output.
    console.error(`PR357 Supabase catalog failed: ${error.message}`);
    process.exitCode = 1;
  });
}
