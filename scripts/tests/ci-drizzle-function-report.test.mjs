import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FUNCTION_SIGNATURES, FUNCTION_METADATA_SQL, REPORT_PATH,
  reportDatabaseUrl, normalizeFunctionRows, migrationReferences,
  buildReport, collectFunctionRows, writeFunctionReport,
} from "../ci-drizzle-function-report.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENV = { CI: "true", GITHUB_ACTIONS: "true", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };
const SHA = "a".repeat(40);
const SOURCE_MD5 = "1234567890abcdef1234567890abcdef";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const manifest = { migrations: [
  { tag: "0117_income_statement_documents" },
  { tag: "0118_income_statement_calculation_corrections" },
  { tag: "0119_income_statement_fx_validity" },
] };

// Metadata fixtures only. Importing this module never loads postgres, starts a
// process or connects to a database. Bodies below are inert test strings.
function rows() {
  return FUNCTION_SIGNATURES.map((signature, index) => ({
    signature,
    definition: `CREATE OR REPLACE FUNCTION ${signature}\n RETURNS jsonb\n LANGUAGE plpgsql\n SET search_path TO 'public'\nAS $function$BEGIN\n${index ? `IF source_hash IS DISTINCT FROM '${SOURCE_MD5}'\n  THEN RAISE EXCEPTION 'Document source version changed; review and refresh MEJ-001'; END IF;\n` : ""}RETURN '{}'::jsonb; END;$function$\n`,
    source_md5: index ? "fedcba0987654321fedcba0987654321" : SOURCE_MD5,
    security_definer: false, configuration: ["search_path=public"], volatility: "s", owner: "postgres",
    acl_source: "explicit",
    acl: [
      { grantor: "postgres", grantee: "postgres", privilege: "EXECUTE", grantable: false },
      { grantor: "postgres", grantee: "authenticated", privilege: "EXECUTE", grantable: false },
    ],
  }));
}

test("only GitHub Actions at the exact existing CI endpoint is allowed", () => {
  assert.equal(reportDatabaseUrl(ENV), ENV.DB_URL);
  for (const patch of [
    { GITHUB_ACTIONS: undefined }, { GITHUB_ACTIONS: "false" }, { CI: undefined },
    { DB_URL: "postgresql://postgres:postgres@remote.invalid:54322/postgres" },
    { DB_URL: ENV.DB_URL.replace("54322", "5432") },
    { DB_URL: `${ENV.DB_URL}?options=--search_path=private` },
  ]) assert.throws(() => reportDatabaseUrl({ ...ENV, ...patch }));
});

test("ordinary invocation fails before loading a driver or opening a database", async () => {
  await assert.rejects(writeFunctionReport({ env: {}, rootDir: ROOT }), /GitHub Actions/);
});

test("exact whitelist is two complete public signatures, not an extensible name filter", () => {
  assert.deepEqual(FUNCTION_SIGNATURES, [
    "public.get_income_statement(date,date,text)",
    "public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)",
  ]);
  assert.equal(Object.isFrozen(FUNCTION_SIGNATURES), true);
});

test("metadata query is constrained by exact OID and reads no business tables or ledger", () => {
  assert.match(FUNCTION_METADATA_SQL, /WHERE p\.oid = pg_catalog\.to_regprocedure\(\$1\) AND p\.prokind = 'f'/);
  assert.match(FUNCTION_METADATA_SQL, /pg_catalog\.pg_get_functiondef\(p\.oid\)/);
  assert.match(FUNCTION_METADATA_SQL, /pg_catalog\.md5\(p\.prosrc\)/);
  assert.match(FUNCTION_METADATA_SQL, /aclexplode\(COALESCE\(p\.proacl, pg_catalog\.acldefault\('f', p\.proowner\)\)\)/);
  assert.doesNotMatch(FUNCTION_METADATA_SQL, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL)\b/i);
  const sources = [...FUNCTION_METADATA_SQL.matchAll(/\b(?:FROM|JOIN)\s+([\w.]+)/gi)].map((match) => match[1]);
  assert.deepEqual(sources, ["pg_catalog.aclexplode", "pg_catalog.pg_proc"]);
  assert.doesNotMatch(FUNCTION_METADATA_SQL, /SELECT\s+\*/i);
});

test("collector opens one repeatable read read-only transaction and exactly two parameterized queries", async () => {
  const calls = [];
  const input = rows();
  const connection = { begin: async (options, callback) => {
    assert.equal(options, "isolation level repeatable read read only");
    return callback({ unsafe: async (query, parameters) => {
      calls.push({ query, parameters });
      return [input.find((row) => row.signature === parameters[0])];
    } });
  } };
  assert.deepEqual(await collectFunctionRows(connection), input);
  assert.deepEqual(calls, FUNCTION_SIGNATURES.map((signature) => ({ query: FUNCTION_METADATA_SQL, parameters: [signature] })));
});

test("collector fails closed for missing or duplicate definitions", async () => {
  for (const found of [[], [rows()[0], rows()[0]]]) {
    let calls = 0;
    const connection = { begin: async (_options, callback) => callback({ unsafe: async () => { calls++; return found; } }) };
    await assert.rejects(collectFunctionRows(connection), /Expected one function/);
    assert.equal(calls, 1, "stop before collecting additional metadata");
  }
});

test("report preserves exact effective definitions, hashes, ACL flags and explicit invoker/search_path", () => {
  const input = rows();
  input[0].acl_source = "default";
  input[0].acl.push({ grantor: "postgres", grantee: "PUBLIC", privilege: "EXECUTE", grantable: true });
  const normalized = normalizeFunctionRows(input);
  for (const [index, fn] of normalized.entries()) {
    assert.equal(fn.definition, input[index].definition);
    assert.equal(fn.definitionSha256, sha256(input[index].definition));
    assert.equal(fn.sourceMd5, input[index].source_md5);
    assert.equal(fn.security, "INVOKER");
    assert.equal(fn.searchPath, "public");
    assert.deepEqual(fn.configuration, ["search_path=public"]);
  }
  assert.equal(normalized[0].aclSource, "default");
  assert.ok(normalized[0].acl.some((entry) => entry.grantee === "PUBLIC" && entry.grantable));
  // Recording is not permission hardening: it must not hide an inherited grant.
  assert.deepEqual(normalized[0].acl, [...input[0].acl].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
});

test("deterministic output order is independent of database row and ACL order", () => {
  const input = rows();
  const reversed = structuredClone(input).reverse();
  for (const row of reversed) row.acl.reverse();
  assert.deepEqual(normalizeFunctionRows(reversed), normalizeFunctionRows(input));
});

test("unknown metadata fields are not serialized into the artifact", () => {
  const input = rows();
  input[0].unrelated = "DO_NOT_EXPORT";
  input[0].acl[0].unrelated = "DO_NOT_EXPORT";
  assert.equal(JSON.stringify(normalizeFunctionRows(input)).includes("DO_NOT_EXPORT"), false);
});

for (const [label, mutate] of [
  ["missing function", (input) => input.pop()],
  ["extra function", (input) => input.push({ ...input[0], signature: "public.unrelated()" })],
  ["duplicate function", (input) => { input[1] = input[0]; }],
  ["wrong signature", (input) => { input[0].signature = "private.get_income_statement(date,date,text)"; }],
  ["null definition", (input) => { input[0].definition = null; }],
  ["empty definition", (input) => { input[0].definition = " "; }],
  ["wrong definition header", (input) => { input[0].definition = "CREATE OR REPLACE FUNCTION public.unrelated()"; }],
  ["missing body hash", (input) => { input[0].source_md5 = null; }],
  ["definer privilege", (input) => { input[0].security_definer = true; }],
  ["unknown security", (input) => { delete input[0].security_definer; }],
  ["missing search_path", (input) => { input[0].configuration = null; }],
  ["changed search_path", (input) => { input[0].configuration = ["search_path=public, private"]; }],
  ["duplicate search_path", (input) => { input[0].configuration.push("search_path=public"); }],
  ["unrelated custom configuration", (input) => { input[0].configuration.push("app.private_setting=DO_NOT_EXPORT"); }],
  ["missing owner", (input) => { input[0].owner = ""; }],
  ["missing ACL", (input) => { input[0].acl = null; }],
  ["empty ACL", (input) => { input[0].acl = []; }],
  ["missing grant flag", (input) => { delete input[0].acl[0].grantable; }],
  ["invalid privilege", (input) => { input[0].acl[0].privilege = "SELECT"; }],
  ["missing source fingerprint", (input) => { input[1].definition = input[1].definition.replace(SOURCE_MD5, "missing"); }],
  ["canonical source drift", (input) => { input[0].source_md5 = "0".repeat(32); }],
  ["ambiguous source fingerprint", (input) => { input[1].definition += input[1].definition; }],
]) {
  test(`metadata fails closed: ${label}`, () => {
    const input = rows();
    mutate(input);
    assert.throws(() => normalizeFunctionRows(input));
  });
}

test("migration map distinguishes the two names and binds reference line numbers to file bytes", () => {
  const references = migrationReferences(ROOT);
  assert.deepEqual(Object.keys(references), FUNCTION_SIGNATURES);
  const canonical = references[FUNCTION_SIGNATURES[0]];
  const documents = references[FUNCTION_SIGNATURES[1]];
  assert.ok(canonical.some((item) => item.path.endsWith("0036_multi_org_analytics_rpc_invoker_scope.sql")));
  assert.deepEqual(documents.map((item) => item.path), [
    "drizzle/migrations/0117_income_statement_documents.sql",
    "drizzle/migrations/0118_income_statement_calculation_corrections.sql",
    "drizzle/migrations/0119_income_statement_fx_validity.sql",
  ]);
  for (const signature of FUNCTION_SIGNATURES) {
    for (const entry of references[signature]) {
      const bytes = readFileSync(`${ROOT}/${entry.path}`);
      assert.equal(entry.sha256, sha256(bytes));
      assert.ok(entry.lineNumbers.every((line) => Number.isInteger(line) && line > 0));
      for (const line of entry.lineNumbers) assert.ok(bytes.toString("utf8").split(/\r?\n/)[line - 1].includes(signature.split("(")[0].slice(7)));
    }
  }
});

test("artifact is JSON round-trippable and bound to commit/replay manifest, not to environment secrets", () => {
  const report = buildReport({ rows: rows(), rootDir: ROOT, replayManifest: manifest, commit: SHA });
  assert.deepEqual(JSON.parse(`${JSON.stringify(report, null, 2)}\n`), report);
  assert.equal(report.formatVersion, 1);
  assert.equal(report.commit, SHA);
  assert.equal(report.replayManifestSha256, sha256(`${JSON.stringify(manifest, null, 2)}\n`));
  assert.match(report.purpose, /not production-state/);
  assert.match(report.migrationReferenceKind, /not proof of mutation or application/);
  assert.equal(report.functions.length, 2);
  assert.equal(JSON.stringify(report).includes(ENV.DB_URL), false);
});

test("report rejects missing provenance and prerequisite migrations", () => {
  for (const commit of [undefined, "main", "a".repeat(39)]) {
    assert.throws(() => buildReport({ rows: rows(), rootDir: ROOT, replayManifest: manifest, commit }));
  }
  assert.throws(() => buildReport({ rows: rows(), rootDir: ROOT, replayManifest: { migrations: [] }, commit: SHA }), /Missing required migration/);
});

test("workflow collects only after verified replay, before mutable fixtures, and reuses reports upload", () => {
  const workflow = readFileSync(`${ROOT}/.github/workflows/rls-db-tests.yml`, "utf8");
  const reportStep = workflow.indexOf("run: node scripts/ci-drizzle-function-report.mjs");
  assert.ok(reportStep > workflow.indexOf("bun scripts/ci-drizzle-replay.mjs verify"));
  assert.ok(reportStep < workflow.indexOf("Recurring invoice locking regression"));
  assert.match(workflow.slice(reportStep - 200, reportStep), /if: success\(\) && steps\.drizzle\.outcome == 'success'/);
  assert.match(workflow, /name: rls-db-reports\s+path: reports\/\s+retention-days: 14/);
  assert.equal(REPORT_PATH, "reports/income-statement-effective-functions.json");
  assert.equal((workflow.match(/"scripts\/ci-drizzle-\*\.mjs"/g) || []).length, 2, "push and PR paths already cover script");
  const pkg = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8"));
  assert.equal(pkg.scripts["test:ci-tools"], "node --test scripts/tests/ci-drizzle-*.test.mjs");
});
