import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CONTRACT_KINDS, classifyLegacyDiagnostics, evaluateStaticContracts, loadCanonicalContractHistory } from "../ci-pr357-static-contracts.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const canonical = loadCanonicalContractHistory(root);
const core = canonical.history.filter((entry) => /\/(?:0016|0020|0031)_/.test(entry.file));
const admin = "organization_document_counters";
const ledger = "storage_object_migrations";
const ledger2 = "storage_reference_migrations";
const evaluate = (history = core, options = {}) => evaluateStaticContracts(history, options);
const append = (sql) => [...core, { file: "drizzle/migrations/0130_fixture.sql", sql }];
const findCode = (result, code) => result.failures.some((finding) => finding.code === code);
const baseline = () => {
  const result = evaluate();
  assert.equal(result.status, "REPLAY_REQUIRED");
  assert.equal(result.requiresFreshReplay, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.contracts.length, 3);
  assert(result.contracts.every((contract) => contract.status === "REPLAY_REQUIRED"));
  return result;
};
function mutate(prefix, from, to) {
  baseline();
  const copy = core.map((entry) => ({ ...entry }));
  const source = copy.find((entry) => entry.file.includes("/" + prefix + "_"));
  assert(source.sql.includes(from), "Mutation must change the real source");
  source.sql = source.sql.replace(from, to);
  return evaluate(copy);
}

test("the exact audited three-table sources establish authored properties, never standalone PASS", () => {
  const result = baseline();
  assert.equal(result.eligibleLegacyFindings.length, 3);
  assert.deepEqual(result.contracts.map((c) => c.kind), ["administrative", "deny-policy", "deny-policy"]);
  assert.equal(result.contracts[0].authoredProperties.policyCount, 0);
  assert.deepEqual(result.contracts[0].authoredProperties.revokedPrincipals, ["PUBLIC", "anon", "authenticated"]);
  assert.equal(result.contracts[1].authoredProperties.policyCount, 1);
  assert.equal(result.contracts[2].authoredProperties.policyCount, 1);
});

test("full canonical context includes every source without using replay receipt exclusions", () => {
  assert.equal(canonical.history.length, 123);
  assert.equal(canonical.prelude.length, 593);
  assert.equal(canonical.files.length, 123);
  assert(canonical.files.some((file) => file.includes("/0108_")));
  assert(canonical.files.some((file) => file.includes("/0110_")));
  const result = evaluate(canonical.history, { prelude: canonical.prelude });
  assert.equal(result.status, "REPLAY_REQUIRED");
  assert.deepEqual(result.failures, []);
  assert(result.indeterminate.length > 0);
  assert(result.indeterminate.some((v) => v.reason === "PROCEDURAL_OR_OPAQUE_EFFECT_REQUIRES_REPLAY"));
});

test("eight real-source mutations reject for their own demonstrated cause", () => {
  for (const [prefix, from, to, expected] of [
    ["0016", "FROM PUBLIC, anon, authenticated", "FROM PUBLIC, authenticated", "CREATION_REVOKE_MISSING_ANON"],
    ["0020", "storage_object_migrations FROM anon, authenticated", "storage_object_migrations FROM anon", "CREATION_REVOKE_MISSING_AUTHENTICATED"],
    ["0020", "storage_reference_migrations FROM anon, authenticated", "storage_reference_migrations FROM authenticated", "CREATION_REVOKE_MISSING_ANON"],
    ["0031", "ALTER TABLE public.organization_document_counters ENABLE ROW LEVEL SECURITY;", "", "FINAL_RLS_MISSING"],
  ]) {
    const result = mutate(prefix, from, to);
    assert.equal(result.status, "FAIL");
    assert(findCode(result, expected), expected);
  }
  for (const [sql, expected] of [
    ["GRANT TRUNCATE ON public." + admin + " TO PUBLIC;", "UNEXPECTED_TABLE_GRANT"],
    ["GRANT SELECT(id) ON public." + ledger + " TO authenticated;", "UNEXPECTED_TABLE_GRANT"],
    ["ALTER TABLE public." + ledger2 + " DISABLE ROW LEVEL SECURITY;", "RLS_OR_TRIGGER_DISABLED"],
    ["CREATE POLICY open_read ON public." + ledger + " FOR SELECT TO authenticated USING(true);", "LEDGER_POLICY_NOT_SINGLE_PUBLIC_FALSE"],
  ]) {
    const result = evaluate(append(sql));
    assert.equal(result.status, "FAIL");
    assert(findCode(result, expected), expected);
  }
});

test("confirmed violations are sticky even when a later statement restores the final shape", () => {
  for (const sql of [
    "GRANT SELECT ON public." + admin + " TO authenticated; REVOKE ALL ON public." + admin + " FROM authenticated;",
    "GRANT SELECT ON public." + ledger + " TO authenticated WITH GRANT OPTION; REVOKE SELECT ON public." + ledger + " FROM authenticated;",
    "ALTER TABLE public." + admin + " DISABLE ROW LEVEL SECURITY; ALTER TABLE public." + admin + " ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE ONLY public." + admin + " DISABLE ROW LEVEL SECURITY; ALTER TABLE ONLY public." + admin + " ENABLE ROW LEVEL SECURITY;",
    "GRANT service_role TO authenticated; REVOKE service_role FROM authenticated;",
  ]) assert.equal(evaluate(append(sql)).status, "FAIL");
});

test("direct PUBLIC, inherited-role and all-table changes cannot be replaced by a passing replay", () => {
  for (const sql of [
    "GRANT SELECT ON public." + ledger + " TO unknown_reader;",
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;",
    "GRANT SELECT ON ALL TABLES IN SCHEMA other, public TO authenticated;",
    "GRANT service_role TO anon;",
    "ALTER ROLE authenticated BYPASSRLS;",
    "ALTER TABLE public." + admin + " OWNER TO authenticated;",
    "ALTER TABLE public.parent ATTACH PARTITION public." + ledger + " DEFAULT;",
    "DROP TABLE public.unrelated, public." + ledger2 + ";",
  ]) {
    const result = evaluate(append(sql));
    assert.equal(result.status, "FAIL", sql);
    assert(result.failures.length);
  }
});

test("policy contracts cannot be exchanged or widened under the same names", () => {
  for (const sql of [
    "CREATE POLICY deny_also ON public." + admin + " FOR ALL TO PUBLIC USING(false) WITH CHECK(false);",
    "CREATE POLICY second ON public." + ledger + " FOR ALL TO PUBLIC USING(false) WITH CHECK(false);",
    "ALTER POLICY changed ON public." + ledger + " USING(true);",
    "DROP POLICY changed ON public." + ledger2 + ";",
  ]) assert.equal(evaluate(append(sql)).status, "FAIL");
  assert.equal(mutate("0020", "USING (false)", "USING (true)").status, "FAIL");
  assert.equal(mutate("0020", "WITH CHECK (false)", "WITH CHECK (true)").status, "FAIL");
});

test("quoted lookalike tables do not borrow another table's legacy disposition", () => {
  for (const name of [
    '"ORGANIZATION_DOCUMENT_COUNTERS"',
    '"organization_document_counters""extra"',
    '"public.organization_document_counters"',
    "organization_document_countersé",
  ]) {
    const result = mutate("0016", "CREATE TABLE IF NOT EXISTS public.organization_document_counters (",
      "CREATE TABLE public." + name + " (");
    assert.equal(result.status, "FAIL");
    assert.equal(result.eligibleLegacyFindings.some((v) => v.table === admin), false);
  }
  const quotedPublic = mutate("0016", "FROM PUBLIC, anon, authenticated", 'FROM "PUBLIC", anon, authenticated');
  assert.equal(quotedPublic.status, "FAIL");
  assert(findCode(quotedPublic, "CREATION_REVOKE_MISSING_PUBLIC"));
  for (const declaration of [
    'CREATE TABLE "public.organization_document_counters" (id integer);',
    'CREATE TABLE "PUBLIC.ORGANIZATION_DOCUMENT_COUNTERS!extra" (id integer);',
    'CREATE TABLE "ORGANIZATION_DOCUMENT_COUNTERS" (id integer);',
    'CREATE TABLE "ORGANIZATION_DOCUMENT_COUNTERS!extra" (id integer);',
    "CREATE TABLE organization_document_counters (id integer);",
    'CREATE TABLE "PUBLIC".organization_document_counters (id integer);',
    "CREATE TABLE organization_document_counters.other (id integer);",
  ]) {
    const copy = core.map((entry) => ({ ...entry }));
    copy[0].sql += "\n" + declaration;
    const result = evaluate(copy);
    assert(findCode(result, "AMBIGUOUS_LEGACY_TABLE_IDENTITY"));
    assert.equal(result.status, "FAIL");
  }
  assert.equal(evaluate(append("CREATE TABLE public.organization_document_counters_extra (id integer);")).status, "REPLAY_REQUIRED");
});

test("comments, literal text and unexecuted function bodies cannot supply contract clauses", () => {
  for (const replacement of [
    "-- REVOKE ALL ON TABLE public." + admin + "\n-- FROM PUBLIC, anon, authenticated;",
    "SELECT 'REVOKE ALL ON TABLE public." + admin + " FROM PUBLIC, anon, authenticated;';",
    "CREATE FUNCTION public.note_only() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN REVOKE ALL ON TABLE public." + admin + " FROM PUBLIC, anon, authenticated; END $body$;",
  ]) {
    const result = mutate("0016", "REVOKE ALL ON TABLE public.organization_document_counters\n  FROM PUBLIC, anon, authenticated;", replacement);
    assert.equal(result.status, "FAIL");
    assert(findCode(result, "CREATION_REVOKE_MISSING_ANON"));
  }
});

test("opaque and unknown effects require fresh replay without pretending they are safe or malicious", () => {
  for (const sql of [
    "DO $$ BEGIN EXECUTE current_setting('app.dynamic_sql'); END $$;",
    "CALL public.opaque_effect();",
    "SET ROLE authenticated;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC;",
    "ALTER TABLE public." + ledger + " ADD COLUMN new_value integer;",
  ]) {
    const result = evaluate(append(sql));
    assert.equal(result.status, "REPLAY_REQUIRED");
    assert(result.indeterminate.some((v) => v.file.endsWith("0130_fixture.sql")));
    assert(result.requiresFreshReplay);
  }
});

test("migration order and missing contract creation cannot produce an eligible disposition", () => {
  for (const history of [core.toReversed(), core.filter((entry) => !entry.file.includes("/0016_")), [...core, core[2]]]) {
    assert.equal(evaluate(history).status, "FAIL");
  }
  const beforeCreation = core.map((entry) => ({ ...entry }));
  beforeCreation[1].sql = "ALTER TABLE public." + ledger + " ENABLE ROW LEVEL SECURITY;\n" + beforeCreation[1].sql.replace("ALTER TABLE public." + ledger + " ENABLE ROW LEVEL SECURITY;", "");
  assert.equal(evaluate(beforeCreation).status, "FAIL");
});

test("original linter observations are retained and only exact property-backed observations are eligible", () => {
  const run = spawnSync(process.env.LINT_MIGRATIONS_RUNTIME ?? process.execPath,
    [join(root, "scripts/lint-migrations.ts"), ...canonical.files], { cwd: root, encoding: "utf8" });
  assert.ifError(run.error);
  assert.equal(run.status, 1);
  const analysis = evaluate(canonical.history, { prelude: canonical.prelude });
  const result = classifyLegacyDiagnostics(run.stderr, analysis);
  assert.equal(result.status, "REPLAY_REQUIRED");
  assert.equal(result.eligible.length, 3);
  assert.deepEqual(result.blocking, []);
  assert(result.eligible.every((finding) => finding.diagnostic.startsWith("::error file=")));
  for (const edit of [
    run.stderr.replace("GRANT ON public.storage_object_migrations", "CREATE POLICY ON public.storage_object_migrations"),
    run.stderr.replace("0016_multi_org_phase6_numbering_fiscal_scope.sql", "0999_another_creation.sql"),
    run.stderr + "::error file=drizzle/migrations/0130_ordinary.sql::public.ordinary creada pero faltan: CREATE POLICY ON public.ordinary\n",
    run.stderr + "::error file=drizzle/migrations/0130_ordinary.sql::Función SECURITY DEFINER sin search_path\n",
    run.stderr + "unrecognized scanner output\n",
  ]) assert.equal(classifyLegacyDiagnostics(edit, analysis).status, "FAIL");
  assert.equal(classifyLegacyDiagnostics(run.stderr, mutate("0016", "FROM PUBLIC, anon, authenticated", "FROM PUBLIC, authenticated")).status, "FAIL");
});

test("canonical loader rejects missing SQL, invalid journal and duplicate Supabase versions", () => {
  const directory = mkdtempSync(join(tmpdir(), "liftgo-composite-source-"));
  try {
    mkdirSync(join(directory, "drizzle/migrations/meta"), { recursive: true });
    mkdirSync(join(directory, "supabase/migrations"), { recursive: true });
    const journal = { version: "7", dialect: "postgresql", entries: [{ idx: 0, tag: "0000_fixture", when: 1, version: "7", breakpoints: true }] };
    writeFileSync(join(directory, "drizzle/migrations/meta/_journal.json"), JSON.stringify(journal));
    assert.throws(() => loadCanonicalContractHistory(directory), /missing/);
    writeFileSync(join(directory, "drizzle/migrations/0000_fixture.sql"), "SELECT 1;");
    assert.equal(loadCanonicalContractHistory(directory).files.length, 1);
    writeFileSync(join(directory, "supabase/migrations/20261001000000_first.sql"), "SELECT 1;");
    writeFileSync(join(directory, "supabase/migrations/20261001000000_second.sql"), "SELECT 1;");
    assert.throws(() => loadCanonicalContractHistory(directory), /unambiguous/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
