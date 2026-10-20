import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ciDatabaseUrl, prepareReplay, validateReplay, assertReplayLedger, validateCanonicalJournal,
} from "../ci-drizzle-replay.mjs";

// This fixture is a target-specific release receipt, not a schema migration.
// Keep these independent expectations explicit: deriving the pin from the code
// under test would let an accidental widening of the omission pass unnoticed.
const RECEIPT = {
  idx: 108,
  tag: "0108_control0108_verified_release",
  when: 1792440638110,
  sha256: "ce97a5bcebbcf5f5671861c4d74ed33b3c930710e9f99ded7441a7daf5ec89eb",
};
const OPTIONAL_RECEIPT = {
  idx: 110,
  tag: "0110_control0109_verified_release",
  sha256: "3e99b978f260dedd927dd1104b84b5af74ee524b3d78dff0acd9446c2df2e13f",
};
const isPinnedReceipt = (entry) => [RECEIPT.tag, OPTIONAL_RECEIPT.tag].includes(entry.tag);
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENV = Object.freeze({
  CI: "true",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function fixture(t) {
  const rootDir = mkdtempSync(path.join(tmpdir(), "ci-drizzle-replay-test-"));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  const canonicalDir = path.join(rootDir, "drizzle/migrations");
  cpSync(path.join(REPO_ROOT, "drizzle/migrations"), canonicalDir, { recursive: true });
  const journalPath = path.join(canonicalDir, "meta/_journal.json");
  return { rootDir, canonicalDir, journalPath, env: { ...ENV } };
}

function sqlSnapshot(directory) {
  return Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith(".sql"))
    .sort().map((name) => [name, readFileSync(path.join(directory, name))]));
}

function assertSqlBytes(directory, expected) {
  const actual = sqlSnapshot(directory);
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const name of Object.keys(expected)) {
    assert.equal(actual[name].equals(expected[name]), true, `${name} must be byte-identical`);
  }
}

function ledger(entries) {
  return entries.map((entry, index) => ({
    id: index + 1,
    hash: entry.sha256,
    created_at: String(entry.when),
  }));
}

function addFutureMigration(f) {
  const journal = readJson(f.journalPath);
  const last = journal.entries.at(-1);
  // The repository keeps growing beyond the pinned receipt. Match the next
  // journal identity instead of reusing 0109 forever.
  const tag = `${String(last.idx + 1).padStart(4, "0")}_after_release_receipt`;
  const entry = {
    idx: last.idx + 1,
    version: "7",
    when: last.when + 1,
    tag,
    breakpoints: true,
  };
  journal.entries.push(entry);
  writeJson(f.journalPath, journal);
  writeFileSync(path.join(f.canonicalDir, `${tag}.sql`), "-- Future migration must still execute.\nSELECT 1;\n");
  return entry;
}

test("CI URL allows only the explicitly selected disposable loopback database", () => {
  assert.equal(ciDatabaseUrl(ENV), ENV.DB_URL);
  assert.equal(ciDatabaseUrl({ ...ENV, LOVABLE_DB_MIGRATION_URL: "postgresql://ignored@remote.invalid/production" }), ENV.DB_URL);
});

test("CI URL refuses remote endpoints, alternate identities, options, and ordinary invocations", () => {
  for (const DB_URL of [
    undefined, "", "not a database URL",
    "postgresql://postgres:fixture@project.supabase.co:54322/postgres",
    "postgresql://postgres:fixture@localhost:54322/postgres",
    "postgresql://postgres:fixture@127.0.0.2:54322/postgres",
    "postgresql://postgres:fixture@[::1]:54322/postgres",
    "postgresql://postgres:fixture@127.0.0.1:5432/postgres",
    "postgresql://postgres:fixture@127.0.0.1:54322/production",
    "postgresql://service_role:fixture@127.0.0.1:54322/postgres",
    "https://postgres:fixture@127.0.0.1:54322/postgres",
    `${ENV.DB_URL}?options=--search_path=private`,
    `${ENV.DB_URL}?host=remote.invalid`,
    `${ENV.DB_URL}#fragment`,
  ]) {
    assert.throws(() => ciDatabaseUrl({ ...ENV, DB_URL }), `must reject ${DB_URL}`);
  }
  for (const CI of [undefined, "", "false", "1", "TRUE", true]) {
    assert.throws(() => ciDatabaseUrl({ ...ENV, CI }), `must reject CI=${CI}`);
  }
});

test("prepare omits exactly the pinned receipt from replay, retaining all canonical bytes and functional SQL", async (t) => {
  const f = fixture(t);
  const sourceJournalBytes = readFileSync(f.journalPath);
  const canonicalJournal = readJson(f.journalPath);
  const sourceSql = sqlSnapshot(f.canonicalDir);
  const receiptEntry = canonicalJournal.entries.find((entry) => entry.tag === RECEIPT.tag);
  assert.deepEqual({ idx: receiptEntry.idx, tag: receiptEntry.tag, when: receiptEntry.when },
    { idx: RECEIPT.idx, tag: RECEIPT.tag, when: RECEIPT.when });
  assert.equal(digest(sourceSql[`${RECEIPT.tag}.sql`]), RECEIPT.sha256);

  const replay = await prepareReplay(f);
  const expected = canonicalJournal.entries.filter((entry) => !isPinnedReceipt(entry));
  assert.equal(replay.databaseUrl, ENV.DB_URL);
  assert.notEqual(path.resolve(replay.migrationsDir), path.resolve(f.canonicalDir));
  assert.deepEqual(readFileSync(f.journalPath), sourceJournalBytes, "canonical journal is immutable");
  assertSqlBytes(f.canonicalDir, sourceSql);
  const functionalSql = Object.fromEntries(Object.entries(sourceSql).filter(([name]) => !isPinnedReceipt({ tag: name.slice(0, -4) })));
  assertSqlBytes(replay.migrationsDir, functionalSql);
  assert.equal(existsSync(path.join(replay.migrationsDir, `${RECEIPT.tag}.sql`)), false);
  assert.deepEqual(readJson(path.join(replay.migrationsDir, "meta/_journal.json")).entries, expected);
  assert.deepEqual(replay.entries, expected.map((entry) => ({
    ...entry, sha256: digest(sourceSql[`${entry.tag}.sql`]), bytes: sourceSql[`${entry.tag}.sql`].length,
  })));
  assert.ok(existsSync(replay.manifestPath));
  assert.equal(JSON.stringify(readJson(replay.manifestPath)).includes(RECEIPT.sha256), true,
    "manifest records the exact excluded receipt hash");
  assert.deepEqual(validateReplay(f).entries, replay.entries);
});

test("the omission is not a cutoff: later migrations retain their original identities and execute", async (t) => {
  const f = fixture(t);
  const futures = [addFutureMigration(f), addFutureMigration(f)];
  const future = futures.at(-1);
  const replay = await prepareReplay(f);
  const replayJournal = readJson(path.join(replay.migrationsDir, "meta/_journal.json"));
  assert.deepEqual(replayJournal.entries.slice(-futures.length), futures);
  assert.equal(replay.entries.at(-1).idx, future.idx);
  assert.equal(replay.entries.at(-1).tag, future.tag);
  assert.equal(replay.entries.some((entry) => entry.tag === RECEIPT.tag), false);
  assert.doesNotThrow(() => assertReplayLedger(ledger(replay.entries), replay.entries));
});

test("receipt hash drift cannot silently widen the exception", async (t) => {
  const f = fixture(t);
  appendFileSync(path.join(f.canonicalDir, `${RECEIPT.tag}.sql`), "\n-- modified receipt\n");
  await assert.rejects(() => prepareReplay(f));
});

for (const [label, mutate] of [
  ["receipt timestamp changed", (journal) => { journal.entries[108].when += 1; }],
  ["receipt index changed", (journal) => { journal.entries[108].idx = 109; }],
  ["receipt tag changed", (journal) => { journal.entries[108].tag = "0108_other_receipt"; }],
  ["receipt removed", (journal) => { journal.entries.splice(RECEIPT.idx, 1); }],
  ["duplicate tag", (journal) => { journal.entries[1].tag = journal.entries[0].tag; }],
  ["noncontiguous index", (journal) => { journal.entries[1].idx = 4; }],
  ["nonmonotonic timestamp", (journal) => { journal.entries[1].when = journal.entries[0].when; }],
  ["string timestamp", (journal) => { journal.entries[1].when = String(journal.entries[1].when); }],
  ["unsafe integer timestamp", (journal) => { journal.entries[108].when = Number.MAX_SAFE_INTEGER + 1; }],
  ["traversal tag", (journal) => { journal.entries[0].tag = "../outside"; }],
  ["wrong dialect", (journal) => { journal.dialect = "mysql"; }],
]) {
  test(`canonical validation refuses ${label}`, async (t) => {
    const f = fixture(t);
    const journal = readJson(f.journalPath);
    mutate(journal);
    writeJson(f.journalPath, journal);
    await assert.rejects(() => prepareReplay(f));
  });
}

test("canonical validation refuses an unjournaled SQL file", async (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.canonicalDir, "0109_unjournaled.sql"), "SELECT 1;\n");
  await assert.rejects(() => prepareReplay(f));
});

test("canonical validation refuses a missing journaled SQL file", async (t) => {
  const f = fixture(t);
  const first = readJson(f.journalPath).entries[0];
  rmSync(path.join(f.canonicalDir, `${first.tag}.sql`));
  await assert.rejects(() => prepareReplay(f));
});

test("validation refuses an unprepared replay", (t) => {
  assert.throws(() => validateReplay(fixture(t)));
});

test("validation refuses source SQL drift after preparation", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  appendFileSync(path.join(f.canonicalDir, `${replay.entries[0].tag}.sql`), "\n-- source drift\n");
  assert.throws(() => validateReplay(f));
});

test("validation refuses staged SQL tampering even when the journal is unchanged", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  appendFileSync(path.join(replay.migrationsDir, `${replay.entries[0].tag}.sql`), "\n-- staged drift\n");
  assert.throws(() => validateReplay(f));
});

test("validation checks the retained canonical receipt bytes even though it is not executed", async (t) => {
  const f = fixture(t);
  await prepareReplay(f);
  appendFileSync(path.join(f.canonicalDir, `${RECEIPT.tag}.sql`), "\n-- excluded does not mean unchecked\n");
  assert.throws(() => validateReplay(f));
});

test("validation refuses to restore the excluded receipt to the staged journal", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  cpSync(f.journalPath, path.join(replay.migrationsDir, "meta/_journal.json"));
  assert.throws(() => validateReplay(f));
});

test("validation refuses silently dropping a real migration from the staged journal", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  const stagedJournalPath = path.join(replay.migrationsDir, "meta/_journal.json");
  const stagedJournal = readJson(stagedJournalPath);
  stagedJournal.entries.pop();
  writeJson(stagedJournalPath, stagedJournal);
  assert.throws(() => validateReplay(f));
});

test("validation refuses a changed manifest", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  writeJson(replay.manifestPath, {});
  assert.throws(() => validateReplay(f));
});

test("ledger validation accepts exact executed hashes and timestamps, including pg bigint strings", async (t) => {
  const replay = await prepareReplay(fixture(t));
  const rows = ledger(replay.entries);
  assert.doesNotThrow(() => assertReplayLedger(rows, replay.entries));
  assert.doesNotThrow(() => assertReplayLedger(rows.map((row) => ({ ...row, created_at: Number(row.created_at) })), replay.entries));
  assert.doesNotThrow(() => assertReplayLedger(rows.map((row) => ({ ...row, created_at: BigInt(row.created_at) })), replay.entries));
});

test("prefix mode accepts only a genuine executed prefix; full mode requires all migrations", async (t) => {
  const replay = await prepareReplay(fixture(t));
  const rows = ledger(replay.entries);
  for (const prefix of [[], rows.slice(0, 1), rows.slice(0, -1), rows]) {
    assert.doesNotThrow(() => assertReplayLedger(prefix, replay.entries, { allowPrefix: true }));
  }
  assert.throws(() => assertReplayLedger([], replay.entries));
  assert.throws(() => assertReplayLedger(rows.slice(0, -1), replay.entries));
  assert.throws(() => assertReplayLedger(rows.slice(1), replay.entries, { allowPrefix: true }));
});

for (const [label, mutate] of [
  ["wrong executed hash", (rows) => { rows[0].hash = "0".repeat(64); }],
  ["wrong executed timestamp", (rows) => { rows[0].created_at = String(Number(rows[0].created_at) + 1); }],
  ["duplicate ledger row", (rows) => { rows[1] = { ...rows[0] }; }],
  ["swapped execution order", (rows) => { [rows[0], rows[1]] = [rows[1], rows[0]]; }],
  ["missing interior migration", (rows) => { rows.splice(1, 1); }],
  ["extra ledger row", (rows) => { rows.push({ id: rows.length + 1, hash: "0".repeat(64), created_at: "1792440638111" }); }],
  ["fabricated release receipt", (rows) => { rows.push({ id: rows.length + 1, hash: RECEIPT.sha256, created_at: String(RECEIPT.when) }); }],
]) {
  test(`ledger validation refuses ${label} in full and prefix modes`, async (t) => {
    const replay = await prepareReplay(fixture(t));
    const rows = ledger(replay.entries);
    mutate(rows);
    assert.throws(() => assertReplayLedger(rows, replay.entries));
    assert.throws(() => assertReplayLedger(rows, replay.entries, { allowPrefix: true }));
  });
}

function loadConfig(f, extraEnv = {}) {
  // Exercise the actual TypeScript config with only defineConfig stubbed. No
  // Drizzle/Postgres driver is loaded and no database connection can be made.
  cpSync(path.join(REPO_ROOT, "drizzle.ci.config.ts"), path.join(f.rootDir, "drizzle.ci.config.ts"));
  mkdirSync(path.join(f.rootDir, "scripts"), { recursive: true });
  cpSync(path.join(REPO_ROOT, "scripts/ci-drizzle-replay.mjs"), path.join(f.rootDir, "scripts/ci-drizzle-replay.mjs"));
  const stubDir = path.join(f.rootDir, "node_modules/drizzle-kit");
  mkdirSync(stubDir, { recursive: true });
  writeJson(path.join(stubDir, "package.json"), { name: "drizzle-kit", type: "module", exports: "./index.js" });
  writeFileSync(path.join(stubDir, "index.js"), "export const defineConfig = (config) => config;\n");
  writeJson(path.join(f.rootDir, "package.json"), { type: "module" });
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `
    const { default: config } = await import(${JSON.stringify(pathToFileURL(path.join(f.rootDir, "drizzle.ci.config.ts")).href)});
    process.stdout.write(JSON.stringify(config));
  `], {
    cwd: f.rootDir,
    env: { PATH: process.env.PATH, ...ENV, ...extraEnv },
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("the CI config uses the validated local replay and cannot select the ordinary remote URL", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  const result = loadConfig(f, { LOVABLE_DB_MIGRATION_URL: "postgresql://ignored@remote.invalid/production" });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.dialect, "postgresql");
  assert.equal(config.dbCredentials.url, ENV.DB_URL);
  assert.equal(path.resolve(f.rootDir, config.out), path.resolve(replay.migrationsDir));
});

test("the CI config fails closed for remote DB_URL, missing CI, or an unprepared replay", async (t) => {
  const f = fixture(t);
  await prepareReplay(f);
  for (const extraEnv of [
    { DB_URL: "postgresql://postgres:fixture@remote.invalid:54322/postgres" },
    { CI: "false" },
    { DB_URL: "" },
  ]) {
    const result = loadConfig(f, extraEnv);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, "config must fail before it can reach a database");
  }
  const unprepared = loadConfig(fixture(t));
  assert.equal(unprepared.error, undefined);
  assert.notEqual(unprepared.status, 0);
});

test("canonical journal parser refuses malformed schemas, duplicate filenames, and metadata drift", (t) => {
  const f = fixture(t);
  const canonical = readJson(f.journalPath);
  const files = readdirSync(f.canonicalDir).filter((name) => name.endsWith(".sql"));
  assert.deepEqual(validateCanonicalJournal(canonical, files), canonical.entries);
  for (const journal of [null, [], {}, { ...canonical, entries: [] },
    { ...canonical, version: "6" }, { ...canonical, entries: [null] }]) {
    assert.throws(() => validateCanonicalJournal(journal, files));
  }
  for (const badFiles of [null, [], [...files, files[0]], [...files, "not-sql.txt"], [...files, null]]) {
    assert.throws(() => validateCanonicalJournal(canonical, badFiles));
  }
  for (const change of [{ version: "6" }, { breakpoints: "true" }, { when: 0 }]) {
    const journal = structuredClone(canonical);
    Object.assign(journal.entries[0], change);
    assert.throws(() => validateCanonicalJournal(journal, files));
  }
});

test("a valid canonical journal still cannot rename or remove the pinned receipt", async (t) => {
  for (const action of ["rename", "remove"]) {
    const f = fixture(t);
    addFutureMigration(f); // Exercise removal when the receipt is not the tail.
    const journal = readJson(f.journalPath);
    const receiptPath = path.join(f.canonicalDir, `${RECEIPT.tag}.sql`);
    if (action === "rename") {
      const tag = "0108_other_release_receipt";
      journal.entries[108].tag = tag;
      cpSync(receiptPath, path.join(f.canonicalDir, `${tag}.sql`));
    } else {
      journal.entries.splice(RECEIPT.idx, 1);
      // Keep this malicious fixture structurally valid after removing the
      // actual receipt, so the independent pinned-receipt guard must reject it.
      // Only temporary fixture identities change; canonical source is untouched.
      for (const [idx, entry] of journal.entries.entries()) {
        if (idx < RECEIPT.idx) continue;
        const oldTag = entry.tag;
        entry.idx = idx;
        entry.tag = `${String(idx).padStart(4, "0")}_${oldTag.slice(5)}`;
        renameSync(path.join(f.canonicalDir, `${oldTag}.sql`),
          path.join(f.canonicalDir, `${entry.tag}.sql`));
      }
    }
    rmSync(receiptPath);
    writeJson(f.journalPath, journal);
    assert.doesNotThrow(() => validateCanonicalJournal(journal,
      readdirSync(f.canonicalDir).filter((name) => name.endsWith(".sql"))));
    await assert.rejects(() => prepareReplay(f), /Unrecognized 0108 receipt/);
  }
});

test("a manifest edit cannot bless modified staged SQL", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  const modifiedFile = path.join(replay.migrationsDir, `${replay.entries[0].tag}.sql`);
  appendFileSync(modifiedFile, "\n-- attacker recalculates the manifest\n");
  const bytes = readFileSync(modifiedFile);
  const manifest = readJson(replay.manifestPath);
  manifest.migrations[0].sha256 = digest(bytes);
  manifest.migrations[0].bytes = bytes.length;
  writeJson(replay.manifestPath, manifest);
  assert.throws(() => validateReplay(f));
});

test("an injected receipt file fails validation, and preparation deterministically removes stale files", async (t) => {
  const f = fixture(t);
  const original = await prepareReplay(f);
  const manifestBytes = readFileSync(original.manifestPath);
  const receiptPath = path.join(original.migrationsDir, `${RECEIPT.tag}.sql`);
  cpSync(path.join(f.canonicalDir, `${RECEIPT.tag}.sql`), receiptPath);
  assert.throws(() => validateReplay(f));
  const preparedAgain = await prepareReplay(f);
  assert.equal(existsSync(receiptPath), false);
  assert.equal(readFileSync(preparedAgain.manifestPath).equals(manifestBytes), true);
  assert.deepEqual(preparedAgain.entries, original.entries);
});

test("ledger timestamps must be exact integers rather than coercible values", async (t) => {
  const replay = await prepareReplay(fixture(t));
  const expected = replay.entries[0];
  for (const created_at of [null, undefined, true, NaN, Infinity,
    Number(expected.when) + 0.5, `0${expected.when}`, ` ${expected.when}`, `${expected.when}.0`]) {
    assert.throws(() => assertReplayLedger([{ hash: expected.sha256, created_at }], replay.entries, { allowPrefix: true }));
  }
});

function verifyWithFakeDriver(f, rows, { tableExists = true, env = {} } = {}) {
  // This is a protocol-level fake: any SQL other than the two read-only ledger
  // queries fails. It proves verification consumes observed rows, never writes
  // a synthetic receipt, and closes its connection on success or mismatch.
  mkdirSync(path.join(f.rootDir, "scripts"), { recursive: true });
  cpSync(path.join(REPO_ROOT, "scripts/ci-drizzle-replay.mjs"), path.join(f.rootDir, "scripts/ci-drizzle-replay.mjs"));
  const stubDir = path.join(f.rootDir, "node_modules/postgres");
  mkdirSync(stubDir, { recursive: true });
  writeJson(path.join(stubDir, "package.json"), { name: "postgres", type: "module", exports: "./index.js" });
  writeJson(path.join(f.rootDir, "observed-ledger.json"), { rows, tableExists });
  writeFileSync(path.join(stubDir, "index.js"), `
    import { appendFileSync, readFileSync } from "node:fs";
    export default function postgres(url) {
      if (url !== ${JSON.stringify(ENV.DB_URL)}) throw new Error("unexpected endpoint");
      appendFileSync("driver-events.log", "connect\\n");
      const state = JSON.parse(readFileSync("observed-ledger.json", "utf8"));
      const connection = async (strings, ...params) => {
        const sql = strings.join("?").trim();
        if (params.length) throw new Error("unexpected SQL parameters");
        appendFileSync("driver-events.log", sql + "\\n");
        if (sql === "select to_regclass('drizzle.__drizzle_migrations') as id") return [{ id: state.tableExists ? "drizzle.__drizzle_migrations" : null }];
        if (sql === "select hash, created_at from drizzle.__drizzle_migrations order by created_at, id") return state.rows;
        throw new Error("unexpected database operation: " + sql);
      };
      connection.end = async () => appendFileSync("driver-events.log", "end\\n");
      return connection;
    }
  `);
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `
    const { verifyReplay } = await import(${JSON.stringify(pathToFileURL(path.join(f.rootDir, "scripts/ci-drizzle-replay.mjs")).href)});
    process.stdout.write(JSON.stringify(await verifyReplay()));
  `], {
    cwd: f.rootDir,
    env: { PATH: process.env.PATH, ...ENV, ...env },
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("verification reads the exact observed ledger and never inserts a fictional receipt", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  const result = verifyWithFakeDriver(f, ledger(replay.entries));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { count: replay.entries.length, excludedReceipts: readJson(f.journalPath).entries.filter(isPinnedReceipt).map(({ tag }) => tag) });
  const events = readFileSync(path.join(f.rootDir, "driver-events.log"), "utf8").trim().split("\n");
  assert.deepEqual(events, [
    "connect",
    "select to_regclass('drizzle.__drizzle_migrations') as id",
    "select hash, created_at from drizzle.__drizzle_migrations order by created_at, id",
    "end",
  ]);
});

test("verification rejects missing, changed, or fabricated ledger state and always closes the driver", async (t) => {
  for (const scenario of ["missing table", "missing migration", "wrong hash", "fabricated receipt"]) {
    const f = fixture(t);
    const replay = await prepareReplay(f);
    const rows = ledger(replay.entries);
    if (scenario === "missing migration") rows.pop();
    if (scenario === "wrong hash") rows[0].hash = "0".repeat(64);
    if (scenario === "fabricated receipt") rows.push({ hash: RECEIPT.sha256, created_at: String(RECEIPT.when) });
    const result = verifyWithFakeDriver(f, rows, { tableExists: scenario !== "missing table" });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, scenario);
    assert.match(result.stderr, /CI replay ledger/, scenario);
    assert.equal(readFileSync(path.join(f.rootDir, "driver-events.log"), "utf8").endsWith("end\n"), true, scenario);
  }
});

test("verification refuses a remote endpoint before importing or invoking a database driver", async (t) => {
  const f = fixture(t);
  const replay = await prepareReplay(f);
  const result = verifyWithFakeDriver(f, ledger(replay.entries), {
    env: { DB_URL: "postgresql://postgres:fixture@remote.invalid:54322/postgres" },
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exact disposable PostgreSQL URL/);
  assert.equal(existsSync(path.join(f.rootDir, "driver-events.log")), false);
});


test("byte-identical symlinks cannot replace canonical SQL, replay SQL, or the replay manifest", async (t) => {
  for (const target of ["canonical SQL", "replay SQL", "manifest"]) {
    const f = fixture(t);
    const replay = await prepareReplay(f);
    const filename = `${replay.entries[0].tag}.sql`;
    const original = target === "manifest" ? replay.manifestPath
      : path.join(target === "canonical SQL" ? f.canonicalDir : replay.migrationsDir, filename);
    const backing = path.join(f.rootDir, "symlink-backing-file");
    cpSync(original, backing);
    rmSync(original);
    symlinkSync(backing, original);
    assert.throws(() => validateReplay(f), /non-symlink/, target);
  }
});


function addOptionalReceipt(f) {
  const journal = readJson(f.journalPath);
  const existing = journal.entries.find(({ tag }) => tag === OPTIONAL_RECEIPT.tag);
  const entry = existing ?? {
    idx: OPTIONAL_RECEIPT.idx, version: "7", tag: OPTIONAL_RECEIPT.tag,
    when: journal.entries.at(-1).when + 1, breakpoints: true,
  };
  if (!existing) {
    assert.equal(journal.entries.length, OPTIONAL_RECEIPT.idx);
    journal.entries.push(entry);
    writeJson(f.journalPath, journal);
  }
  const bytes = readFileSync(path.join(REPO_ROOT, "scripts/tests/fixtures/control0109-receipt.sql"));
  assert.equal(digest(bytes), OPTIONAL_RECEIPT.sha256, "reviewed fixture pin must remain independent");
  writeFileSync(path.join(f.canonicalDir, `${entry.tag}.sql`), bytes);
  return entry;
}

test("optional exact 0110 receipt is excluded while 0109 and later functional migrations execute", async (t) => {
  const f = fixture(t);
  const receipt = addOptionalReceipt(f);
  const future = addFutureMigration(f);
  const sourceSql = sqlSnapshot(f.canonicalDir);
  const journalBytes = readFileSync(f.journalPath);
  const replay = await prepareReplay(f);
  assert.deepEqual(replay.manifest.excludedReceipts.map(({ idx, tag, when, sha256 }) => ({ idx, tag, when, sha256 })),
    [RECEIPT, { ...OPTIONAL_RECEIPT, when: receipt.when }]);
  assert.ok(replay.entries.some(({ idx, tag }) => idx === 109 && tag === "0109_nonrecurring_invoice_period_overlap"));
  assert.ok(replay.entries.some(({ tag }) => tag === future.tag));
  assert.equal(existsSync(path.join(replay.migrationsDir, `${receipt.tag}.sql`)), false);
  assertSqlBytes(f.canonicalDir, sourceSql);
  assert.deepEqual(readFileSync(f.journalPath), journalBytes);
  assert.doesNotThrow(() => assertReplayLedger(ledger(replay.entries), replay.entries));
  const fabricated = [...ledger(replay.entries), { hash: OPTIONAL_RECEIPT.sha256, created_at: receipt.when }];
  assert.throws(() => assertReplayLedger(fabricated, replay.entries), /CI replay ledger/);
  const missing0109 = ledger(replay.entries).filter((_, idx) => replay.entries[idx].idx !== 109);
  assert.throws(() => assertReplayLedger(missing0109, replay.entries), /CI replay ledger/);
});

test("absent optional receipt does not block preparation or skip unrelated index 110", async (t) => {
  const f = fixture(t);
  const journal = readJson(f.journalPath);
  // Build the pre-activation history even after the official runner adds 0110.
  const removed = journal.entries.splice(OPTIONAL_RECEIPT.idx);
  for (const entry of removed) rmSync(path.join(f.canonicalDir, `${entry.tag}.sql`));
  writeJson(f.journalPath, journal);
  const absent = await prepareReplay(f);
  assert.deepEqual(absent.manifest.excludedReceipts.map(({ tag }) => tag), [RECEIPT.tag]);
  const unrelated = addFutureMigration(f);
  const replay = await prepareReplay(f);
  assert.equal(unrelated.idx, 110);
  assert.ok(replay.entries.some(({ tag }) => tag === unrelated.tag));
});

for (const scenario of ["bytes", "tag", "duplicate", "missing file", "missing journal entry", "breakpoints", "timestamp", "version"]) {
  test(`optional receipt fails closed for ${scenario}`, async (t) => {
    const f = fixture(t);
    const receipt = addOptionalReceipt(f);
    const sqlPath = path.join(f.canonicalDir, `${receipt.tag}.sql`);
    const journal = readJson(f.journalPath);
    if (scenario === "bytes") appendFileSync(sqlPath, "\n-- unreviewed change\n");
    if (scenario === "tag") {
      journal.entries[110].tag = "0110_other_receipt";
      renameSync(sqlPath, path.join(f.canonicalDir, "0110_other_receipt.sql"));
    }
    if (scenario === "duplicate") {
      const future = { ...receipt, idx: journal.entries.length,
        tag: `${String(journal.entries.length).padStart(4, "0")}_duplicate_receipt`,
        when: journal.entries.at(-1).when + 1 };
      journal.entries.push(future);
      cpSync(sqlPath, path.join(f.canonicalDir, `${future.tag}.sql`));
    }
    if (scenario === "missing file") rmSync(sqlPath);
    if (scenario === "missing journal entry") journal.entries.splice(110, 1);
    if (scenario === "breakpoints") journal.entries[110].breakpoints = false;
    if (scenario === "timestamp") journal.entries[110].when = journal.entries[109].when;
    if (scenario === "version") journal.entries[110].version = "6";
    writeJson(f.journalPath, journal);
    await assert.rejects(() => prepareReplay(f));
  });
}

for (const scenario of ["timestamp drift", "removed receipt", "manifest timestamp", "restored staged receipt"]) {
  test(`prepared optional exclusion cannot accept ${scenario}`, async (t) => {
    const f = fixture(t);
    const receipt = addOptionalReceipt(f);
    const replay = await prepareReplay(f);
    if (scenario === "timestamp drift") {
      const journal = readJson(f.journalPath);
      journal.entries[110].when += 1;
      writeJson(f.journalPath, journal);
    }
    if (scenario === "removed receipt") {
      const journal = readJson(f.journalPath);
      journal.entries.splice(110, 1);
      writeJson(f.journalPath, journal);
      rmSync(path.join(f.canonicalDir, `${receipt.tag}.sql`));
    }
    if (scenario === "manifest timestamp") {
      const manifest = readJson(replay.manifestPath);
      manifest.excludedReceipts[1].when += 1;
      writeJson(replay.manifestPath, manifest);
    }
    if (scenario === "restored staged receipt") {
      cpSync(path.join(f.canonicalDir, `${receipt.tag}.sql`), path.join(replay.migrationsDir, `${receipt.tag}.sql`));
    }
    assert.throws(() => validateReplay(f));
  });
}
