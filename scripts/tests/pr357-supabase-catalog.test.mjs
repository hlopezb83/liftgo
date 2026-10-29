import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertPristine, buildSnapshotSql, cleanupSupabase, expectedBaselineConfig, prepareSupabase, requireCiContext,
  validateDockerIdentity, verifySnapshotIdentity, verifySupabaseBaseline, verifySupabaseVersions } from "./pr357-supabase-catalog.mjs";
import { CATALOG_QUERIES } from "./pr357-catalog-audit.mjs";

const SHA = "e748d828543427d2067334d64a8367d19798cb36";

function ownedFixture() {
  const timestamp = Date.parse("2026-10-28T22:00:01.500Z");
  return { state: { projectId: "local_test", preparedAt: timestamp },
    container: { Id: "a".repeat(64), Name: "/supabase_db_local_test", Created: "2026-10-28T22:00:02.000000000Z",
      Config: { Image: "public.ecr.aws/supabase/postgres:17.4.1.068", Labels: { "com.supabase.cli.project": "local_test" } },
      State: { Running: true, StartedAt: "2026-10-28T22:00:03.000000000Z" },
      Mounts: [{ Type: "volume", Name: "supabase_db_local_test", RW: true, Destination: "/var/lib/postgresql/data" }] },
    volume: { Name: "supabase_db_local_test", CreatedAt: "2026-10-28T22:00:02Z" } };
}

function mockRunner() {
  const temporary = mkdtempSync(join(tmpdir(), "liftgo-pr357-supabase-contract-"));
  const root = join(temporary, "repo");
  const runnerTemp = join(temporary, "runner-temp");
  for (const directory of ["supabase/migrations", "drizzle/migrations/meta", "scripts/tests", "reports"]) mkdirSync(join(root, directory), { recursive: true });
  mkdirSync(runnerTemp);
  writeFileSync(join(root, "supabase/config.toml"), 'project_id = "local_test"\n');
  writeFileSync(join(root, "supabase/migrations/20260101000000_test.sql"), "SELECT 1;\n");
  writeFileSync(join(root, "drizzle/migrations/0000_test.sql"), "SELECT 1;\n");
  writeFileSync(join(root, "drizzle/migrations/meta/_journal.json"), "{}\n");
  writeFileSync(join(root, "scripts/patch_legacy_migrations.py"), "# Contract fixture; subprocess is mocked.\n");
  writeFileSync(join(root, "scripts/ci-drizzle-replay.mjs"), "// Contract fixture.\n");
  writeFileSync(join(root, "scripts/ci_database.py"), "# Contract fixture.\n");
  writeFileSync(join(root, "scripts/tests/pr357-catalog-audit.mjs"), "// Contract fixture.\n");
  writeFileSync(join(root, "scripts/tests/pr357-supabase-catalog.mjs"), "// Contract fixture.\n");
  const env = { CI: "true", GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_REPOSITORY: "hlopezb83/liftgo", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1",
    PR357_EXPECTED_SHA: SHA, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_JOB: "supabase-replay", GITHUB_WORKSPACE: root, RUNNER_TEMP: runnerTemp };
  const calls = [];
  let volumes = "";
  let containers = "";
  let stopFails = false;
  let stale = false;
  const run = (command, args, options) => {
    calls.push({ command, args, cwd: options?.cwd });
    if (command === "git" && args[0] === "rev-parse") return `${SHA}\n`;
    if (command === "git" && args[0] === "diff") return "";
    if (command === "git" && args[0] === "ls-tree") return "supabase/migrations/20260101000000_test.sql\ndrizzle/migrations/0000_test.sql\n";
    if (command === "python3") return args.includes("-c") ? `${options.input.trimEnd()}\n\n[db.seed]\nenabled = false\n` : "";
    if (command === "docker" && args[0] === "volume" && args[1] === "ls") return volumes;
    if (command === "docker" && args[0] === "ps") return args.includes("--filter") ? "" : containers;
    if (command === "docker" && args[0] === "network" && args[1] === "ls") return "";
    if (command === "docker" && args[0] === "volume" && args[1] === "inspect") {
      return JSON.stringify([{ Name: args[2], CreatedAt: new Date(stale ? 0 : Date.now() + 1000).toISOString() }]);
    }
    if (command === "supabase" && args.join(" ") === "stop --no-backup") {
      if (stopFails) throw new Error("mock stop failed");
      return "";
    }
    throw new Error("Unexpected mocked command");
  };
  return { root, env, run, calls, runnerTemp,
    setInventory(v, c) { volumes = v; containers = c; },
    failStop() { stopFails = true; },
    staleResource() { stale = true; },
    close() { rmSync(temporary, { recursive: true, force: true }); } };
}

test("Docker guard accepts exactly the freshly owned pinned container and data volume", () => {
  const fixture = ownedFixture();
  const result = validateDockerIdentity(fixture.state, fixture.container, fixture.volume);
  assert.equal(result.name, "supabase_db_local_test");
  assert.equal(result.data_mount, "/var/lib/postgresql/data");
});

test("Docker guard rejects changed identity, image, freshness, mount and reused volume", () => {
  const cases = [
    (f) => { f.container.Name = "/supabase_db_other"; },
    (f) => { f.container.Id = "short"; },
    (f) => { f.container.Config.Labels = {}; },
    (f) => { f.container.Config.Labels["com.supabase.cli.project"] = "other"; },
    (f) => { f.container.Config.Image = "other/postgres:17"; },
    (f) => { f.container.State.Running = false; },
    (f) => { f.container.Created = "2026-10-28T21:59:00Z"; },
    (f) => { f.container.State.StartedAt = "2026-10-28T21:59:00Z"; },
    (f) => { f.container.Mounts[0].Name = "preexisting"; },
    (f) => { f.container.Mounts[0].Type = "bind"; },
    (f) => { f.container.Mounts[0].RW = false; },
    (f) => { f.container.Mounts.push({ ...f.container.Mounts[0] }); },
    (f) => { f.container.Mounts.push({ Type:"bind",Destination:"/var/lib/postgresql/data/nested",RW:true }); },
    (f) => { f.container.Mounts.push({ Type:"volume",Destination:"/var/lib/postgresql",RW:false }); },
    (f) => { f.volume.Name = "other"; },
    (f) => { f.volume.CreatedAt = "2026-10-28T21:59:00Z"; },
  ];
  for (const mutate of cases) {
    const f = ownedFixture(); mutate(f);
    assert.throws(() => validateDockerIdentity(f.state, f.container, f.volume));
  }
});

test("catalog identity requires owned data path, Unix socket, readonly, postgres and PG17", () => {
  const owned = { data_mount: "/var/lib/postgresql/data" };
  const valid = { database: "postgres", data_directory: owned.data_mount, transaction_read_only: "on",
    server_address: null, current_user: "postgres", session_user: "postgres", server_version_num: 170004 };
  verifySnapshotIdentity(valid, owned);
  for (const mutation of [{ database: "other" }, { data_directory: "/other/data" },
    { transaction_read_only: "off" }, { server_address: "127.0.0.1" }, { current_user: "other" },
    { session_user: "other" }, { server_version_num: undefined }, { server_version_num: "170004" },
    { server_version_num: 160000 }, { server_version_num: 180000 }]) {
    assert.throws(() => verifySnapshotIdentity({ ...valid, ...mutation }, owned));
  }
});

test("single snapshot SQL is readonly, fixed and includes every shared catalog query and both ledgers", () => {
  const sql = buildSnapshotSql();
  assert.match(sql, /^\\set VERBOSITY sqlstate\nBEGIN READ ONLY;/);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.doesNotMatch(sql, /\b(?:ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|COPY)\s+(?:TABLE|INTO|ON|FROM)\b/i);
  for (const [name, query] of Object.entries(CATALOG_QUERIES)) {
    assert(sql.includes(`'${name}'`));
    assert(sql.includes(query));
  }
  assert(sql.includes("supabase_migrations.schema_migrations"));
  assert(sql.includes("drizzle.__drizzle_migrations"));
  assert(sql.includes("to_regclass('auth.users')"));
});

test("complete Supabase versions must match exactly, without omissions/extras/duplicates", () => {
  const source = [{ path: "supabase/migrations/20260101_a.sql" }, { path: "supabase/migrations/20260102_b.sql" }];
  assert.equal(verifySupabaseVersions(source, [{ version: "20260102" }, { version: "20260101" }]), 2);
  for (const applied of [[{ version: "20260101" }], [{ version: "20260101" }, { version: "20260101" }],
    [{ version: "20260101" }, { version: "20260102" }, { version: "20260103" }]]) {
    assert.throws(() => verifySupabaseVersions(source, applied));
  }
});

test("prepare rejects any pre-existing project container or volume", () => {
  assertPristine("local", ["unrelated"], ["unrelated"]);
  assert.throws(() => assertPristine("local", ["supabase_db_local"], []));
  assert.throws(() => assertPristine("local", [], ["supabase_auth_local"]));
  assert.throws(() => assertPristine("local", [], [], ["supabase_network_local"]));
});

test("CI context refuses missing/remote/unbound input before external commands", () => {
  assert.throws(() => requireCiContext({ env: {}, run() { throw new Error("Must not run"); } }));
  const fixture = mockRunner();
  try {
    for (const mutation of [{ RUNNER_ENVIRONMENT: "self-hosted" }, { GITHUB_REPOSITORY: "other/repo" },
      { GITHUB_EVENT_NAME: "schedule" }, { PR357_EXPECTED_SHA: "bad" }, { GITHUB_RUN_ID: "../../bad" }, { GITHUB_JOB: "" }]) {
      assert.throws(() => requireCiContext({ root: fixture.root, env: { ...fixture.env, ...mutation }, run: fixture.run }));
    }
    for (const mutation of [{ DOCKER_HOST: "tcp://remote.example:2376" }, { DOCKER_CONTEXT: "other" },
      { DOCKER_TLS_VERIFY: "1" }, { DOCKER_CERT_PATH: "/other" }, { SUPABASE_INTERNAL_IMAGE_REGISTRY: "other.example" }]) {
      assert.throws(() => requireCiContext({ root: fixture.root, env: { ...fixture.env, ...mutation }, run: fixture.run }), /runner-local/);
    }
    assert.throws(() => requireCiContext({ root: fixture.root,
      env: { ...fixture.env, PR357_EXPECTED_SHA: "b".repeat(40) }, run: fixture.run }), /differs/);
  } finally { fixture.close(); }
});

test("prepare records exact source and predicted existing transformation in private one-use marker", () => {
  const f = mockRunner();
  try {
    const result = prepareSupabase({ root: f.root, env: f.env, run: f.run });
    assert.equal(result.status, "PREPARED");
    assert.deepEqual(result.source_counts, { supabase: 1, drizzle: 1 });
    const marker = JSON.parse(readFileSync(join(f.runnerTemp, "liftgo-pr357-supabase-123-1/ownership.json"), "utf8"));
    assert.equal(marker.sha, SHA);
    assert.equal(marker.projectId, "local_test");
    assert.equal(marker.job, "supabase-replay");
    assert.equal(result.schema_version, 2);
    assert.equal(result.nonce, marker.nonce);
    assert.deepEqual(marker.expectedPatchedSupabase, marker.supabaseSource);
    assert(f.calls.some((c) => c.command === "python3" && c.cwd.includes("predict-legacy-")));
    assert.throws(() => prepareSupabase({ root: f.root, env: f.env, run: f.run }));
  } finally { f.close(); }
});

test("pre-start baseline binds seed-disabled config, exact sources and this invocation", () => {
  const f=mockRunner();
  try {
    prepareSupabase({root:f.root,env:f.env,run:f.run});
    assert.throws(()=>verifySupabaseBaseline({root:f.root,env:f.env,run:f.run}),/seed-disabled/);
    const config=join(f.root,"supabase/config.toml");
    writeFileSync(config,readFileSync(config,"utf8").trimEnd()+"\n\n[db.seed]\nenabled = false\n");
    const report=verifySupabaseBaseline({root:f.root,env:f.env,run:f.run});
    assert.equal(report.status,"PASS");
    assert.equal(report.baseline.config_seed_disabled,true);
    assert.equal(report.schema_version,2);
    assert.equal(report.job,"supabase-replay");
    assert.throws(()=>verifySupabaseBaseline({root:f.root,env:{...f.env,GITHUB_RUN_ATTEMPT:"2"},run:f.run}));
    f.setInventory("supabase_db_local_test\n","");
    assert.throws(()=>verifySupabaseBaseline({root:f.root,env:f.env,run:f.run}),/pre-existing/);
    f.setInventory("","");
    writeFileSync(join(f.root,"drizzle/migrations/0000_test.sql"),"SELECT 2;\n");
    assert.throws(()=>verifySupabaseBaseline({root:f.root,env:f.env,run:f.run}),/Replay sources differ/);
  } finally {f.close();}
});

test("canonical config prediction uses the existing seed helper and rejects database overrides", () => {
  const f=mockRunner();
  try {
    writeFileSync(join(f.root,"scripts/ci_database.py"),readFileSync(new URL("../ci_database.py",import.meta.url)));
    const result=expectedBaselineConfig(f.root);
    assert.match(result.sourceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.replaySha256,/^[0-9a-f]{64}$/);
    assert.notEqual(result.sourceSha256,result.replaySha256);
    for (const suffix of ["\n[db]\nport = 54323\n", "\n[db.seed]\nsql_paths = ['seed.sql']\n", "\n[storage]\nenabled = true\n"]) {
      writeFileSync(join(f.root,"supabase/config.toml"),'project_id = "local_test"\n'+suffix);
      assert.throws(()=>expectedBaselineConfig(f.root),/python3 failed/);
    }
  } finally {f.close();}
});

test("cleanup version2 is bound to the preparation nonce and current job", () => {
  const f=mockRunner();
  try {
    const prepared=prepareSupabase({root:f.root,env:f.env,run:f.run});
    const report=cleanupSupabase({root:f.root,env:f.env,run:f.run});
    assert.equal(report.nonce,prepared.nonce);
    assert.equal(report.schema_version,2);
    assert.equal(report.prepared_at,prepared.prepared_at);
    assert(report.verified_at>=report.prepared_at);
    assert.throws(()=>cleanupSupabase({root:f.root,env:{...f.env,GITHUB_JOB:"other"},run:f.run}),/does not match/);
  } finally {f.close();}
});

test("prepare rejects untracked migration SQL even when tracked git diff is clean", () => {
  const f = mockRunner();
  try {
    writeFileSync(join(f.root, "supabase/migrations/20260102000000_untracked.sql"), "SELECT 2;\n");
    assert.throws(() => prepareSupabase({ root: f.root, env: f.env, run: f.run }), /file inventory differs/);
    assert.equal(f.calls.filter((c) => c.command === "python3" || c.command === "supabase").length, 0);
  } finally { f.close(); }
});

test("cleanup only stops the marked CI project and proves resources absent", () => {
  const f = mockRunner();
  try {
    prepareSupabase({ root: f.root, env: f.env, run: f.run });
    const result = cleanupSupabase({ root: f.root, env: f.env, run: f.run });
    assert.equal(result.status, "PASS");
    assert.equal(result.project_resources_remaining, false);
    assert(f.calls.some((c) => c.command === "supabase" && c.args.join(" ") === "stop --no-backup" && c.cwd === f.root));
    const marker = join(f.runnerTemp, "liftgo-pr357-supabase-123-1/ownership.json");
    const state = JSON.parse(readFileSync(marker, "utf8")); state.sha = "b".repeat(40);
    writeFileSync(marker, JSON.stringify(state));
    const count = f.calls.filter((c) => c.command === "supabase").length;
    assert.throws(() => cleanupSupabase({ root: f.root, env: f.env, run: f.run }), /does not match/);
    assert.equal(f.calls.filter((c) => c.command === "supabase").length, count);
  } finally { f.close(); }
});

test("cleanup reports FAIL for remaining volumes or a failed stop command", () => {
  for (const cause of ["remaining", "stop"]) {
    const f = mockRunner();
    try {
      prepareSupabase({ root: f.root, env: f.env, run: f.run });
      if (cause === "remaining") f.setInventory("supabase_db_local_test\n", ""); else f.failStop();
      assert.throws(() => cleanupSupabase({ root: f.root, env: f.env, run: f.run }));
      const report = JSON.parse(readFileSync(join(f.root, "reports/pr357-supabase-cleanup.json"), "utf8"));
      assert.equal(report.status, "FAIL");
    } finally { f.close(); }
  }
});

test("cleanup never calls stop if a resource was replaced by a stale or unowned one", () => {
  const f = mockRunner();
  try {
    prepareSupabase({ root: f.root, env: f.env, run: f.run });
    f.setInventory("supabase_db_local_test\n", "");
    f.staleResource();
    assert.throws(() => cleanupSupabase({ root: f.root, env: f.env, run: f.run }), /ownership is unproven/);
    assert.equal(f.calls.filter((c) => c.command === "supabase").length, 0);
    const report = JSON.parse(readFileSync(join(f.root, "reports/pr357-supabase-cleanup.json"), "utf8"));
    assert.equal(report.ownership_verified, false);
    assert.equal(report.stop_attempted, false);
  } finally { f.close(); }
});
