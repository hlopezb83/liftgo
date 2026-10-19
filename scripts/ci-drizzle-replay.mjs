import { createHash } from "node:crypto";
import {
  lstatSync, readFileSync, readdirSync,
} from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

export const CI_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const REPLAY_DIRECTORY = ".ci-drizzle-replay";
export const EXCLUDED_RECEIPT = Object.freeze({
  idx: 108,
  tag: "0108_control0108_verified_release",
  when: 1792440638110,
  sha256: "ce97a5bcebbcf5f5671861c4d74ed33b3c930710e9f99ded7441a7daf5ec89eb",
});
const EXCLUSION_REASON = "Target-bound release-control receipt: its production ledger and ACL assertions cannot attest a fresh CI database. It is not applied or recorded in the CI ledger.";
const JOURNAL_RELATIVE_PATH = "meta/_journal.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A literal allowlist also rejects URL normalization, credentials and query overrides. */
export function ciDatabaseUrl(env = process.env) {
  if (env.CI !== "true" || env.DB_URL !== CI_DATABASE_URL) {
    throw new Error("CI replay requires CI=true and the exact disposable PostgreSQL URL on 127.0.0.1:54322/postgres.");
  }
  return CI_DATABASE_URL;
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate the entire canonical history before deciding whether any entry is excluded. */
export function validateCanonicalJournal(journal, sqlFiles) {
  if (!record(journal) || journal.version !== "7" || journal.dialect !== "postgresql"
    || !Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("Invalid canonical Drizzle journal: expected nonempty PostgreSQL version 7 entries.");
  }
  if (!Array.isArray(sqlFiles) || sqlFiles.some((file) => typeof file !== "string" || !file.endsWith(".sql"))
    || new Set(sqlFiles).size !== sqlFiles.length) {
    throw new Error("Invalid or duplicate canonical SQL filenames.");
  }
  const tags = new Set();
  let previousWhen = 0;
  for (const [index, entry] of journal.entries.entries()) {
    if (!record(entry) || entry.idx !== index || !Number.isSafeInteger(entry.idx)) {
      throw new Error(`Canonical journal idx must be continuous from zero at entry ${index}.`);
    }
    if (typeof entry.tag !== "string" || !/^\d{4}_[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.tag)
      || !entry.tag.startsWith(`${String(index).padStart(4, "0")}_`) || tags.has(entry.tag)) {
      throw new Error(`Invalid, duplicate, or out-of-order canonical journal tag at idx ${index}.`);
    }
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousWhen) {
      throw new Error(`Canonical journal when must be a positive, strictly increasing safe integer at ${entry.tag}.`);
    }
    if (entry.version !== journal.version || typeof entry.breakpoints !== "boolean") {
      throw new Error(`Invalid canonical journal version or breakpoints at ${entry.tag}.`);
    }
    tags.add(entry.tag);
    previousWhen = entry.when;
  }
  const files = new Set(sqlFiles);
  for (const tag of tags) {
    if (!files.has(`${tag}.sql`)) throw new Error(`Canonical SQL file missing: ${tag}.sql`);
  }
  for (const file of files) {
    if (!tags.has(file.slice(0, -4))) throw new Error(`Canonical SQL file is not in the journal: ${file}`);
  }
  return journal.entries;
}

function requireDirectory(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected a real directory: ${directory}`);
}

function readRegularFile(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular, non-symlink file: ${file}`);
  return readFileSync(file);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid JSON in ${label}.`);
  }
}

function loadCanonical(rootDir) {
  const root = path.resolve(rootDir);
  const sourceDirectory = path.join(root, "drizzle/migrations");
  for (const directory of [root, path.join(root, "drizzle"), sourceDirectory, path.join(sourceDirectory, "meta")]) {
    requireDirectory(directory);
  }
  const journalBytes = readRegularFile(path.join(sourceDirectory, JOURNAL_RELATIVE_PATH));
  const journal = parseJson(journalBytes, "canonical journal");
  const sqlFiles = readdirSync(sourceDirectory).filter((file) => /\.sql$/i.test(file));
  validateCanonicalJournal(journal, sqlFiles);
  const sourceEntries = journal.entries.map((entry) => {
    const bytes = readRegularFile(path.join(sourceDirectory, `${entry.tag}.sql`));
    return { entry, bytes, sha256: sha256(bytes) };
  });
  const receipt = sourceEntries.find(({ entry }) => entry.idx === EXCLUDED_RECEIPT.idx);
  if (!receipt || receipt.entry.tag !== EXCLUDED_RECEIPT.tag || receipt.entry.when !== EXCLUDED_RECEIPT.when
    || receipt.sha256 !== EXCLUDED_RECEIPT.sha256) {
    throw new Error("Unrecognized 0108 receipt: exact idx, tag, timestamp and pinned SHA256 are required. No migration was excluded.");
  }
  const included = sourceEntries.filter(({ entry }) => entry.idx !== EXCLUDED_RECEIPT.idx);
  const replayJournal = { ...journal, entries: included.map(({ entry }) => entry) };
  const replayJournalBytes = Buffer.from(`${JSON.stringify(replayJournal, null, 2)}\n`);
  const entries = included.map(({ entry, bytes, sha256: hash }) => ({ ...entry, sha256: hash, bytes: bytes.length }));
  const manifest = {
    version: 1,
    purpose: "local-ci-functional-replay",
    source: "drizzle/migrations",
    sourceJournalSha256: sha256(journalBytes),
    replayJournalSha256: sha256(replayJournalBytes),
    excludedReceipts: [{ ...EXCLUDED_RECEIPT, reason: EXCLUSION_REASON }],
    migrations: entries,
  };
  return { root, sourceDirectory, included, entries, journal: replayJournal, replayJournalBytes, manifest };
}

function requireExactNames(directory, expected) {
  const actual = readdirSync(directory).sort();
  if (!isDeepStrictEqual(actual, [...expected].sort())) {
    throw new Error(`Unexpected, missing, or stale files in CI replay directory: ${directory}`);
  }
}

/**
 * Read-only, synchronous validation is intentional: drizzle-kit loads its config
 * synchronously. Diagnostics use this same validated copy, never the source SQL.
 */
export function validateReplay({ env = process.env, rootDir = process.cwd() } = {}) {
  const databaseUrl = ciDatabaseUrl(env);
  const canonical = loadCanonical(rootDir);
  const replayRoot = path.join(canonical.root, REPLAY_DIRECTORY);
  const migrationsDir = path.join(replayRoot, "migrations");
  const metadataDir = path.join(migrationsDir, "meta");
  const manifestPath = path.join(replayRoot, "manifest.json");
  for (const directory of [replayRoot, migrationsDir, metadataDir]) requireDirectory(directory);
  requireExactNames(replayRoot, ["manifest.json", "migrations"]);
  requireExactNames(migrationsDir, ["meta", ...canonical.entries.map((entry) => `${entry.tag}.sql`)]);
  requireExactNames(metadataDir, ["_journal.json"]);
  const manifest = parseJson(readRegularFile(manifestPath), "CI replay manifest");
  if (!isDeepStrictEqual(manifest, canonical.manifest)) {
    throw new Error("CI replay manifest differs from the canonical source or the pinned receipt exclusion; prepare it again.");
  }
  const journalBytes = readRegularFile(path.join(migrationsDir, JOURNAL_RELATIVE_PATH));
  if (!journalBytes.equals(canonical.replayJournalBytes)) {
    throw new Error("CI replay journal differs from the exact canonical history minus the pinned receipt.");
  }
  for (const { entry, bytes } of canonical.included) {
    if (!readRegularFile(path.join(migrationsDir, `${entry.tag}.sql`)).equals(bytes)) {
      throw new Error(`CI replay SQL is not byte-identical to canonical source: ${entry.tag}`);
    }
  }
  return { databaseUrl, migrationsDir, manifestPath, manifest, journal: canonical.journal, entries: canonical.entries };
}

/** Copy exact SQL bytes; never replace the receipt with a no-op or a ledger row. */
export async function prepareReplay({ env = process.env, rootDir = process.cwd() } = {}) {
  ciDatabaseUrl(env);
  const canonical = loadCanonical(rootDir);
  const destination = path.join(canonical.root, REPLAY_DIRECTORY);
  try {
    requireDirectory(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = await mkdtemp(path.join(canonical.root, `${REPLAY_DIRECTORY}-`));
  try {
    const migrationsDir = path.join(temporary, "migrations");
    await mkdir(path.join(migrationsDir, "meta"), { recursive: true });
    for (const { entry, bytes } of canonical.included) {
      await writeFile(path.join(migrationsDir, `${entry.tag}.sql`), bytes, { flag: "wx" });
    }
    await writeFile(path.join(migrationsDir, JOURNAL_RELATIVE_PATH), canonical.replayJournalBytes, { flag: "wx" });
    await writeFile(path.join(temporary, "manifest.json"), `${JSON.stringify(canonical.manifest, null, 2)}\n`, { flag: "wx" });
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return validateReplay({ env, rootDir: canonical.root });
}

function ledgerTimestamp(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("CI replay ledger contains an invalid created_at timestamp.");
}

/**
 * A prefix is allowed only by rollback diagnostics after a failed migration.
 * Successful CI verification always requires the complete, exact ledger.
 */
export function assertReplayLedger(rows, entries, { allowPrefix = false } = {}) {
  if (!Array.isArray(rows) || !Array.isArray(entries)
    || rows.length > entries.length || (!allowPrefix && rows.length !== entries.length)) {
    throw new Error(`CI replay ledger count mismatch: expected ${entries?.length ?? "?"}, received ${rows?.length ?? "?"}.`);
  }
  for (const [index, row] of rows.entries()) {
    const expected = entries[index];
    if (!record(row) || row.hash !== expected.sha256 || ledgerTimestamp(row.created_at) !== String(expected.when)) {
      throw new Error(`CI replay ledger mismatch at position ${index}: expected ${expected.tag} with its exact SHA256 and timestamp.`);
    }
  }
  return rows.length;
}

export async function verifyReplay({ env = process.env, rootDir = process.cwd() } = {}) {
  const replay = validateReplay({ env, rootDir });
  // The import and connection happen only after every local guard has passed.
  const { default: postgres } = await import("postgres");
  const connection = postgres(replay.databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const table = await connection`select to_regclass('drizzle.__drizzle_migrations') as id`;
    if (!table[0]?.id) throw new Error("CI replay ledger drizzle.__drizzle_migrations is missing.");
    const rows = await connection`select hash, created_at from drizzle.__drizzle_migrations order by created_at, id`;
    assertReplayLedger(rows, replay.entries);
    return { count: rows.length, excludedReceipt: EXCLUDED_RECEIPT.tag };
  } finally {
    await connection.end({ timeout: 5 });
  }
}

async function main(command) {
  if (command === "prepare") {
    const replay = await prepareReplay();
    console.info(`Prepared ${replay.entries.length} byte-identical CI migrations; excluded only ${EXCLUDED_RECEIPT.tag}.`);
    console.info(`Explicit exclusion manifest: ${replay.manifestPath}`);
  } else if (command === "verify") {
    const result = await verifyReplay();
    console.info(`Verified the exact ${result.count}-row CI replay ledger; ${result.excludedReceipt} is not recorded.`);
  } else {
    throw new Error("Usage: node scripts/ci-drizzle-replay.mjs <prepare|verify>");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Do not introduce top-level await: drizzle-kit loads this module via its
  // synchronous TypeScript config loader under the project's Node 24 runtime.
  main(process.argv.length === 3 ? process.argv[2] : undefined).catch((error) => {
    console.error(`CI replay failed: ${error.message}`);
    process.exitCode = 1;
  });
}
