import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ciDatabaseUrl, validateReplay } from "./ci-drizzle-replay.mjs";

// Exact signatures only: no CLI-supplied names, wildcard, catalog dump or RPC call.
export const FUNCTION_SIGNATURES = Object.freeze([
  "public.get_income_statement(date,date,text)",
  "public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)",
]);
export const REPORT_PATH = "reports/income-statement-effective-functions.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function reportDatabaseUrl(env) {
  if (env.GITHUB_ACTIONS !== "true") throw new Error("Function report is restricted to GitHub Actions.");
  return ciDatabaseUrl(env);
}

// Only function metadata, indexed by one allowlisted regprocedure. The function
// bodies are read, never executed. ACL expansion includes PostgreSQL defaults
// when proacl is NULL, but does not enumerate role memberships or table access.
export const FUNCTION_METADATA_SQL = `
SELECT $1::text AS signature,
       pg_catalog.pg_get_functiondef(p.oid) AS definition,
       pg_catalog.md5(p.prosrc) AS source_md5,
       p.prosecdef AS security_definer,
       p.proconfig AS configuration,
       p.provolatile::text AS volatility,
       pg_catalog.pg_get_userbyid(p.proowner)::text AS owner,
       CASE WHEN p.proacl IS NULL THEN 'default' ELSE 'explicit' END AS acl_source,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(a.grantor),
          'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
          'privilege', a.privilege_type, 'grantable', a.is_grantable))
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a) AS acl
FROM pg_catalog.pg_proc p
WHERE p.oid = pg_catalog.to_regprocedure($1) AND p.prokind = 'f'
`;

export function normalizeFunctionRows(rows) {
  if (!Array.isArray(rows) || rows.length !== FUNCTION_SIGNATURES.length
    || new Set(rows.map((row) => row?.signature)).size !== FUNCTION_SIGNATURES.length) {
    throw new Error("Expected exactly the two distinct allowlisted function definitions.");
  }
  const functions = FUNCTION_SIGNATURES.map((signature) => {
    const row = rows.find((candidate) => candidate?.signature === signature);
    const name = signature.split("(")[0];
    if (!record(row) || !nonempty(row.definition)
      || !row.definition.startsWith(`CREATE OR REPLACE FUNCTION ${name}(`)
      || !/^[a-f0-9]{32}$/.test(row.source_md5)) {
      throw new Error(`Missing or invalid definition/hash: ${signature}`);
    }
    if (row.security_definer !== false) throw new Error(`SECURITY INVOKER required: ${signature}`);
    // Do not serialize unrelated custom GUCs, which could contain credentials.
    if (!Array.isArray(row.configuration) || row.configuration.length !== 1
      || row.configuration[0] !== "search_path=public") {
      throw new Error(`Explicit search_path=public required: ${signature}`);
    }
    if (!nonempty(row.owner) || !["i", "s", "v"].includes(row.volatility)
      || !["default", "explicit"].includes(row.acl_source)
      || !Array.isArray(row.acl) || row.acl.length === 0) {
      throw new Error(`Incomplete function metadata/ACL: ${signature}`);
    }
    const acl = row.acl.map((entry) => {
      if (!record(entry) || !nonempty(entry.grantor) || !nonempty(entry.grantee)
        || entry.privilege !== "EXECUTE" || typeof entry.grantable !== "boolean") {
        throw new Error(`Invalid function ACL: ${signature}`);
      }
      return { grantor: entry.grantor, grantee: entry.grantee, privilege: entry.privilege, grantable: entry.grantable };
    }).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    return {
      signature, definition: row.definition, definitionSha256: sha256(row.definition),
      sourceMd5: row.source_md5, security: "INVOKER", searchPath: "public",
      configuration: [...row.configuration].sort(), volatility: row.volatility,
      owner: row.owner, aclSource: row.acl_source, acl,
    };
  });
  // This is the existing 0117/0118/0119 guard, not a new editable SQL authority.
  const fingerprints = [...functions[1].definition.matchAll(
    /IS DISTINCT FROM '([a-f0-9]{32})'\s+THEN RAISE EXCEPTION 'Document source version changed; review and refresh MEJ-001'/g,
  )];
  if (fingerprints.length !== 1 || fingerprints[0][1] !== functions[0].sourceMd5) {
    throw new Error("Document source fingerprint is missing, ambiguous or differs from the canonical function.");
  }
  return functions;
}

/** Text-reference index, not an SQL parser or a claim that every hit mutates it. */
export function migrationReferences(rootDir) {
  const result = Object.fromEntries(FUNCTION_SIGNATURES.map((signature) => [signature, []]));
  for (const lane of ["supabase/migrations", "drizzle/migrations"]) {
    for (const file of readdirSync(path.join(rootDir, lane)).filter((name) => name.endsWith(".sql")).sort()) {
      const relativePath = `${lane}/${file}`;
      const bytes = readFileSync(path.join(rootDir, relativePath));
      const lines = bytes.toString("utf8").split(/\r?\n/);
      for (const signature of FUNCTION_SIGNATURES) {
        const name = signature.split("(")[0].slice("public.".length);
        const pattern = new RegExp(`\\b${name}\\b`);
        const lineNumbers = lines.flatMap((line, index) => pattern.test(line) ? [index + 1] : []);
        if (lineNumbers.length) result[signature].push({ path: relativePath, sha256: sha256(bytes), lineNumbers });
      }
    }
  }
  return result;
}

export function buildReport({ rows, rootDir, replayManifest, commit }) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Expected the checked-out GitHub SHA.");
  const functions = normalizeFunctionRows(rows);
  const references = migrationReferences(rootDir);
  for (const signature of FUNCTION_SIGNATURES) {
    for (const migration of ["0117_income_statement_documents", "0118_income_statement_calculation_corrections", "0119_income_statement_fx_validity"]) {
      if (!references[signature].some((entry) => entry.path === `drizzle/migrations/${migration}.sql`)
        || !replayManifest.migrations.some((entry) => entry.tag === migration)) {
        throw new Error(`Missing required migration reference/replay entry: ${migration}`);
      }
    }
  }
  return {
    formatVersion: 1,
    purpose: "Review-only metadata after the disposable CI replay; not production-state evidence or executable migrations.",
    commit,
    replayManifestSha256: sha256(`${JSON.stringify(replayManifest, null, 2)}\n`),
    migrationReferenceKind: "Textual mentions, including reads, guards and comments; not proof of mutation or application.",
    functions: functions.map((fn) => ({ ...fn, migrationReferences: references[fn.signature] })),
  };
}

export async function collectFunctionRows(connection) {
  return connection.begin("isolation level repeatable read read only", async (tx) => {
    const rows = [];
    for (const signature of FUNCTION_SIGNATURES) {
      const found = await tx.unsafe(FUNCTION_METADATA_SQL, [signature]);
      if (found.length !== 1) throw new Error(`Expected one function: ${signature}`);
      rows.push(found[0]);
    }
    return rows;
  });
}

export async function writeFunctionReport({ env = process.env, rootDir = process.cwd() } = {}) {
  reportDatabaseUrl(env);
  const replay = validateReplay({ env, rootDir });
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA)) throw new Error("Expected the checked-out GitHub SHA.");
  // No driver loading or connection before endpoint and on-disk replay guards.
  const { default: postgres } = await import("postgres");
  const connection = postgres(replay.databaseUrl, {
    max: 1, ssl: false, onnotice: () => {}, connect_timeout: 10,
    connection: { application_name: "ci-income-statement-metadata", default_transaction_read_only: "on", search_path: "pg_catalog" },
  });
  try {
    const report = buildReport({ rows: await collectFunctionRows(connection), rootDir, replayManifest: replay.manifest, commit: env.GITHUB_SHA });
    // No partial or successful-looking report is written before all checks pass.
    await mkdir(path.join(rootDir, "reports"), { recursive: true });
    await writeFile(path.join(rootDir, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  } finally {
    await connection.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  (async () => {
    if (process.argv.length !== 2) throw new Error("No arguments accepted.");
    await writeFunctionReport();
    console.info(`Wrote review-only function metadata: ${REPORT_PATH}`);
  })().catch(() => {
    // Do not echo driver errors, environment, database URLs or definitions.
    console.error("Effective function report failed; no valid new artifact was produced. Check the allowlist, replay and metadata contracts.");
    process.exitCode = 1;
  });
}
