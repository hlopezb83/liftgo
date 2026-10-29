import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HISTORICAL_BASELINE, lintSql, reviewBaseline } from "../lint-migrations.ts";

// Run with: node --test scripts/tests/lint-migrations.test.mjs (Node >= 24).
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "scripts/lint-migrations.ts");
const counters = "drizzle/migrations/0016_multi_org_phase6_numbering_fiscal_scope.sql";
const ledger = "drizzle/migrations/0020_multi_org_phase7_storage_migration_ledger.sql";
const expected = [
  { file: counters, table: "organization_document_counters", rule: "table-requirements", missing: ["rls", "policy"] },
  { file: ledger, table: "storage_object_migrations", rule: "table-requirements", missing: ["grant"] },
  { file: ledger, table: "storage_reference_migrations", rule: "table-requirements", missing: ["grant"] },
];
const sources = [counters, ledger].map((file) => ({
  path: join(root, file), raw: readFileSync(join(root, file), "utf8"),
}));
const identity = ({ file, table, rule, missing }) => ({
  file: relative(root, file).split(sep).join("/"), table, rule, missing,
});

test("baseline contains exactly the three historical diagnostics, all visible as WARN", () => {
  assert.deepEqual(HISTORICAL_BASELINE.map(({ sha256, ...entry }) => entry), expected);
  const warnings = [];
  for (const { path, raw } of sources) {
    const report = reviewBaseline(path, raw);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, lintSql(path, raw));
    warnings.push(...report.warnings);
  }
  assert.deepEqual(warnings.map(identity), expected);
  assert.equal(warnings.length, 3);
});

test("LF and CRLF checkouts retain the same historical text identity", () => {
  for (const { path, raw } of sources) {
    const lf = raw.replaceAll("\r\n", "\n");
    assert.deepEqual(reviewBaseline(path, lf), reviewBaseline(path, lf.replaceAll("\n", "\r\n")));
  }
});

test("any historical content change requires review, including comments and zero findings", () => {
  for (const { path, raw } of sources) {
    for (const changed of [raw + "\n-- changed historical comment\n", "SELECT 1;\n"]) {
      const report = reviewBaseline(path, changed);
      assert.equal(report.warnings.length, 0);
      assert.equal(report.errors.filter(({ rule }) => rule === "baseline-review").length, 1);
      assert.equal(report.errors.length, lintSql(path, changed).length + 1);
    }
  }
});

test("identical SQL in another file, including the same basename, remains blocking", () => {
  for (const { path, raw } of sources) {
    for (const other of [path.replace("drizzle", "supabase"), join(root, "drizzle/migrations/9999_new.sql")]) {
      const findings = lintSql(other, raw);
      const report = reviewBaseline(other, raw);
      assert.ok(findings.length > 0);
      assert.deepEqual(report, { warnings: [], errors: findings });
    }
  }
});

test("extra tables, rules, requirements and duplicate diagnostics cannot expand the baseline", () => {
  const { path, raw } = sources[0];
  const [known] = lintSql(path, raw);
  const additional = [
    { ...known, file: join(root, "drizzle/migrations/9999_new.sql") },
    { ...known, table: "organization_document_counters_extra" },
    { ...known, rule: "permissive-policy" },
    { ...known, missing: ["grant", "rls", "policy"] },
    { ...known, missing: ["rls"] },
    { ...known },
  ];
  const report = reviewBaseline(path, raw, [known, ...additional]);
  assert.deepEqual(report.warnings, [known]);
  assert.deepEqual(report.errors, additional);
});

test("new migrations still require GRANT, RLS and POLICY", () => {
  const path = join(root, "drizzle/migrations/9999_new.sql");
  const raw = "CREATE TABLE public.new_table (id integer);";
  const report = reviewBaseline(path, raw);
  assert.equal(report.warnings.length, 0);
  assert.deepEqual(report.errors.map(({ rule, table, missing }) => ({ rule, table, missing })), [
    { rule: "table-requirements", table: "new_table", missing: ["grant", "rls", "policy"] },
  ]);
  assert.deepEqual(reviewBaseline(path, raw + `
    GRANT SELECT ON public.new_table TO authenticated;
    ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
    CREATE POLICY deny_access ON public.new_table FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  `), { warnings: [], errors: [] });
});

test("SECURITY DEFINER remains per function and permissive policies remain blocking", () => {
  const path = join(root, "drizzle/migrations/9999_new.sql");
  const report = reviewBaseline(path, `
    CREATE FUNCTION public.good() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public AS $$ BEGIN END; $$;
    CREATE FUNCTION public.bad() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      AS $$ BEGIN END; $$;
    CREATE POLICY unsafe ON public.example FOR ALL TO authenticated USING (true);
  `);
  assert.equal(report.warnings.length, 0);
  assert.deepEqual(report.errors.map(({ rule }) => rule), ["security-definer-search-path", "permissive-policy"]);
  assert.match(report.errors[0].message, /public\.bad/);
  assert.deepEqual(lintSql(path, "CREATE POLICY service ON public.example FOR ALL TO service_role USING (true);"), []);
  assert.equal(lintSql(path, "CREATE POLICY unsafe ON public.example FOR ALL TO service_role, authenticated USING (true);").length, 1);
});

test("CLI exits successfully with 3 WARN and fails with 3 WARN plus an additional error", () => {
  const directory = mkdtempSync(join(tmpdir(), "migration-lint-test-"));
  try {
    const run = (files) => {
      const result = spawnSync(process.execPath, [cli, ...files], {
        cwd: directory, encoding: "utf8", timeout: 10000,
      });
      assert.equal(result.error, undefined);
      return result;
    };
    const files = sources.map(({ path }) => path);
    const historical = run(files);
    assert.equal(historical.status, 0, historical.stderr);
    assert.equal((historical.stderr.match(/::warning file=/g) ?? []).length, 3);
    assert.equal((historical.stderr.match(/::error file=/g) ?? []).length, 0);
    assert.match(historical.stdout, /OK: 2 archivo\(s\) validado\(s\), 3 WARN, 0 error\(es\)\./);

    const fresh = join(directory, "9999_new.sql");
    writeFileSync(fresh, "CREATE TABLE public.new_table (id integer);\n");
    const mixed = run([...files, fresh]);
    assert.equal(mixed.status, 1, mixed.stderr);
    assert.equal((mixed.stderr.match(/::warning file=/g) ?? []).length, 3);
    assert.equal((mixed.stderr.match(/::error file=/g) ?? []).length, 1);
    assert.match(mixed.stdout, /FAIL: 3 archivo\(s\) validado\(s\), 3 WARN, 1 error\(es\)\./);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(join(directory, "9999_new.sql"), { force: true });
    rmdirSync(directory);
  }
});
