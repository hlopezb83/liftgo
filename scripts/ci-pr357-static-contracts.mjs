import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateCanonicalJournal } from "./ci-drizzle-replay.mjs";

// These descriptors bind reviewed access invariants, never an acceptance by
// name. This bounded inspection cannot produce standalone PASS: unknown SQL,
// bootstrap ACLs, IF NOT EXISTS and inherited privileges require the fresh
// canonical replay and effective catalog audit in the composite gate.
export const CONTRACT_KINDS = Object.freeze({
  organization_document_counters: "administrative",
  storage_object_migrations: "deny-policy",
  storage_reference_migrations: "deny-policy",
});
const PRODUCTS = ["anon", "authenticated"];
const BACKEND = ["select", "insert", "update"];
const privilegeNames = new Set(["select", "insert", "update", "delete", "truncate", "references", "trigger", "maintain"]);
const targetNames = Object.keys(CONTRACT_KINDS);
const keyword = (token, value) => token?.type === "word" && token.value === value;
const identifier = (token) => ["word", "identifier"].includes(token?.type) ? token.value : null;
const words = (tokens, ...values) => values.every((value, i) => keyword(tokens[i], value));
const normalizedPath = (file) => file.replaceAll("\\", "/").replace(/^\.\//, "");

// Delimit statements without interpreting SQL or PL/pgSQL. Comments and
// unexecuted bodies/literals cannot provide a positive access property.
export function tokenizeContractSql(sql) {
  const tokens = [];
  let offset = 0;
  while (offset < sql.length) {
    if (/\s/.test(sql[offset])) { offset++; continue; }
    if (sql.startsWith("--", offset)) {
      offset = sql.indexOf("\n", offset);
      if (offset < 0) break;
      continue;
    }
    if (sql.startsWith("/*", offset)) {
      let depth = 1; offset += 2;
      while (depth && offset < sql.length) {
        if (sql.startsWith("/*", offset)) { depth++; offset += 2; }
        else if (sql.startsWith("*/", offset)) { depth--; offset += 2; }
        else offset++;
      }
      if (depth) throw new Error("Unterminated SQL comment");
      continue;
    }
    const start = offset;
    const unicode = /^[uU]&['"]/.test(sql.slice(offset));
    const escaped = /^[eE]'/.test(sql.slice(offset));
    if (unicode) offset += 2;
    else if (escaped) offset++;
    const quote = sql[offset];
    if (quote === "'" || quote === '"') {
      offset++; let value = "", closed = false;
      while (offset < sql.length) {
        if (escaped && sql[offset] === "\\") { value += sql.slice(offset, offset + 2); offset += 2; }
        else if (sql[offset] === quote) {
          if (sql[offset + 1] === quote) { value += quote; offset += 2; }
          else { offset++; closed = true; break; }
        } else value += sql[offset++];
      }
      if (!closed) throw new Error("Unterminated SQL literal");
      tokens.push({ type: unicode || escaped ? "unknown-literal" : quote === "'" ? "literal" : "identifier", value, start });
      continue;
    }
    const delimiter = /^\$(?:[a-z_\u0080-\uFFFF][a-z0-9_\u0080-\uFFFF]*)?\$/i.exec(sql.slice(offset))?.[0];
    if (delimiter) {
      const end = sql.indexOf(delimiter, offset + delimiter.length);
      if (end < 0) throw new Error("Unterminated SQL body");
      tokens.push({ type: "body", value: sql.slice(offset + delimiter.length, end), start });
      offset = end + delimiter.length; continue;
    }
    const name = /^[a-z_\u0080-\uFFFF][a-z0-9_$\u0080-\uFFFF]*/i.exec(sql.slice(offset))?.[0];
    if (name) {
      tokens.push({ type: "word", value: name.toLowerCase(), start }); offset += name.length; continue;
    }
    tokens.push({ type: "symbol", value: sql[offset++], start });
  }
  return tokens;
}
function splitStatements(tokens) {
  const result = []; let statement = [];
  for (const token of tokens) {
    if (token.type === "symbol" && token.value === ";") {
      if (statement.length) result.push(statement);
      statement = [];
    } else statement.push(token);
  }
  if (statement.length) result.push(statement);
  return result;
}
function relation(tokens, at) {
  const first = identifier(tokens[at]);
  if (!first) return null;
  if (tokens[at + 1]?.value === ".") {
    const name = identifier(tokens[at + 2]);
    return name ? { schema: first, name, next: at + 3 } : null;
  }
  return { schema: null, name: first, next: at + 1 };
}
function commaList(tokens) {
  if (!tokens.length) return null;
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2) { if (tokens[i].value !== ",") return null; }
    else {
      const value = identifier(tokens[i]);
      if (!value) return null;
      result.push({ value, publicPseudoRole: keyword(tokens[i], "public") });
    }
  }
  return tokens.length % 2 ? result : null;
}
function endParenthesis(tokens, at) {
  if (tokens[at]?.value !== "(") return -1;
  let depth = 0;
  for (let i = at; i < tokens.length; i++) {
    if (tokens[i].value === "(") depth++;
    if (tokens[i].value === ")" && --depth === 0) return i;
  }
  return -1;
}
function literalFalse(tokens) {
  while (tokens[0]?.value === "(" && endParenthesis(tokens, 0) === tokens.length - 1) tokens = tokens.slice(1, -1);
  return tokens.length === 1 && keyword(tokens[0], "false");
}
function state(table) {
  return { table, kind: CONTRACT_KINDS[table], creationFile: null, creationCount: 0,
    rls: false, forced: false, revokes: new Set(), backend: new Set(), policies: new Map(),
    creationRls: false, creationGrant: false, directCreationShape: false, eligible: true };
}

export function evaluateStaticContracts(history, { prelude = [] } = {}) {
  const states = new Map(targetNames.map((name) => [name, state(name)]));
  const failures = [], indeterminate = [];
  const fail = (file, table, code) => {
    if (!failures.some((v) => v.file === file && v.table === table && v.code === code)) failures.push({ file, table, code });
  };
  const unknown = (file, reason) => {
    if (!indeterminate.some((v) => v.file === file && v.reason === reason)) indeterminate.push({ file, reason });
  };
  const matching = (r) => r?.schema === "public" ? states.get(r.name) : null;
  let previous = null;
  for (const source of history) {
    const stamp = /^(\d+)_/.exec(source.file.split(/[\\/]/).at(-1))?.[1];
    if (stamp) {
      if (previous !== null && BigInt(stamp) <= previous) fail(source.file, null, "HISTORY_ORDER_INVALID");
      previous = BigInt(stamp);
    }
  }
  function inspect(source, isPrelude) {
    const file = normalizedPath(source.file);
    let statements;
    try { statements = splitStatements(tokenizeContractSql(source.sql)); }
    catch { unknown(file, "UNMODELED_SQL_LEXICAL_FORM"); return; }
    for (const tokens of statements) {
      if (keyword(tokens[0], "do") || keyword(tokens[0], "call")) {
        unknown(file, "PROCEDURAL_OR_OPAQUE_EFFECT_REQUIRES_REPLAY"); continue;
      }
      if (words(tokens, "create", "function") || words(tokens, "create", "or", "replace", "function")) continue;
      if (words(tokens, "create", "table")) {
        const at = words(tokens.slice(2), "if", "not", "exists") ? 5 : 2;
        const r = relation(tokens, at), table = matching(r);
        if (!r) { unknown(file, "UNMODELED_CREATE_IDENTITY"); continue; }
        // The unchanged legacy linter folds/truncates some quoted identifiers.
        // Such a second identity must never borrow one of these dispositions.
        const legacyPart = r.schema === null ? r.name.replace(/^public\./i, "")
          : r.schema.toLowerCase() === "public" ? r.name : r.schema;
        const legacyHead = /^([a-z_][a-z0-9_]*)/i.exec(legacyPart)?.[1].toLowerCase();
        if (targetNames.includes(legacyHead) && !(r.schema === "public" && r.name === legacyHead)) {
          fail(file, legacyHead, "AMBIGUOUS_LEGACY_TABLE_IDENTITY");
        }
        if (!table) {
          if (r.schema === null && states.has(r.name)) unknown(file, "UNQUALIFIED_CONTRACT_IDENTITY");
          continue;
        }
        if (isPrelude) { unknown(file, "PREEXISTING_CONTRACT_OBJECT_REQUIRES_REPLAY"); continue; }
        table.creationCount++;
        if (table.creationCount !== 1) { fail(file, table.table, "REPEATED_CONTRACT_CREATION"); continue; }
        table.creationFile = file;
        // Earlier clauses may have addressed a pre-existing relation. They
        // cannot establish properties of this newly declared relation.
        table.rls = false; table.forced = false;
        table.revokes.clear(); table.backend.clear(); table.policies.clear();
        table.directCreationShape = tokens[r.next]?.value === "(" && endParenthesis(tokens, r.next) === tokens.length - 1;
        if (!table.directCreationShape) fail(file, table.table, "CONTRACT_RELATION_SHAPE_CHANGED");
        continue;
      }
      if (keyword(tokens[0], "grant") || keyword(tokens[0], "revoke")) {
        const granting = keyword(tokens[0], "grant");
        const on = tokens.findIndex((token) => keyword(token, "on"));
        if (on < 0) {
          // Membership syntax/options are intentionally not interpreted.
          unknown(file, "ROLE_MEMBERSHIP_REQUIRES_REPLAY");
          if (granting && tokens.some((token) => PRODUCTS.includes(identifier(token)))) fail(file, null, "PRODUCT_ROLE_MEMBERSHIP_CHANGED");
          continue;
        }
        let at = on + 1;
        if (keyword(tokens[at], "table")) at++;
        else if (["function", "functions", "procedure", "routine", "sequence", "sequences", "schema", "type", "database"].some((v) => keyword(tokens[at], v))) continue;
        const boundary = tokens.findIndex((token, i) => i >= at && keyword(token, granting ? "to" : "from"));
        const subjects = [];
        if (words(tokens.slice(at), "all", "tables", "in", "schema")) {
          const schemas = commaList(tokens.slice(at + 4, boundary));
          if (schemas) {
            if (schemas.some((schema) => schema.value === "public")) subjects.push(...[...states.values()].filter((table) => table.creationFile));
            at = boundary;
          }
        }
        while (at < boundary) {
          const r = relation(tokens, at);
          if (!r) break;
          if (matching(r)) subjects.push(matching(r));
          at = r.next;
          if (tokens[at]?.value !== ",") break;
          at++;
        }
        const principalTail = tokens.slice(boundary + 1);
        const optionAt = principalTail.findIndex((token) => ["with", "granted", "cascade", "restrict"].some((v) => keyword(token, v)));
        const principals = commaList(optionAt < 0 ? principalTail : principalTail.slice(0, optionAt));
        const permissions = commaList(tokens.slice(1, on));
        if (granting && principals?.some((p) => p.value !== "service_role")) {
          // Column-level privileges are also a demonstrated contract breach;
          // accepting their full grammar is unnecessary to reject that grant.
          for (const table of subjects) fail(file, table.table, "UNEXPECTED_TABLE_GRANT");
        }
        const supported = boundary > 0 && at === boundary && principals && permissions && optionAt < 0
          && permissions.every((p) => p.value === "all" || privilegeNames.has(p.value));
        if (!supported) {
          unknown(file, "UNMODELED_PRIVILEGE_STATEMENT");
          for (const table of subjects) table.eligible = false;
          continue;
        }
        if (isPrelude) { if (subjects.length) unknown(file, "PRELUDE_ACL_REQUIRES_REPLAY"); continue; }
        for (const table of subjects) {
          if (!table.creationFile) { unknown(file, "PRIVILEGES_BEFORE_DECLARED_CREATION"); continue; }
          for (const principal of principals) {
            // The PUBLIC pseudo-role is not a quoted role whose actual name
            // happens to be uppercase PUBLIC.
            const name = principal.publicPseudoRole ? "PUBLIC" : principal.value === "PUBLIC" ? '"PUBLIC"' : principal.value;
            if (granting) {
              if (name !== "service_role") fail(file, table.table, "UNEXPECTED_TABLE_GRANT");
              else for (const permission of permissions) {
                if (permission.value === "all") BACKEND.forEach((p) => table.backend.add(p));
                else table.backend.add(permission.value);
              }
              if (file === table.creationFile) table.creationGrant = true;
            } else if (permissions.length === 1 && permissions[0].value === "all") {
              table.revokes.add(name);
              if (name === "service_role") table.backend.clear();
            }
            else if (name === "service_role" && table.kind === "administrative") {
              for (const permission of permissions) table.backend.delete(permission.value);
            }
          }
        }
        continue;
      }
      if (words(tokens, "alter", "table")) {
        let at = words(tokens.slice(2), "if", "exists") ? 4 : 2;
        const only = keyword(tokens[at], "only");
        if (only) at++;
        const r = relation(tokens, at), table = matching(r);
        if (!table) {
          if (r?.schema === null && states.has(r.name)) unknown(file, "UNQUALIFIED_CONTRACT_IDENTITY");
          if (tokens.some((token) => keyword(token, "attach") || keyword(token, "inherit"))) {
            for (const name of targetNames.filter((name) => tokens.some((token) => identifier(token) === name))) fail(file, name, "CONTRACT_IDENTITY_OR_INHERITANCE_CHANGED");
          }
          continue;
        }
        if (isPrelude) { unknown(file, "PRELUDE_ALTER_REQUIRES_REPLAY"); continue; }
        if (!table.creationFile) { unknown(file, "ALTER_BEFORE_DECLARED_CREATION"); continue; }
        const tail = tokens.slice(r.next);
        if (only) unknown(file, "ONLY_RELATION_EFFECT_REQUIRES_REPLAY");
        if (words(tail, "enable", "row", "level", "security") && tail.length === 4 && !only) {
          table.rls = true;
          if (file === table.creationFile) table.creationRls = true;
        } else if (tail.some((token) => keyword(token, "disable"))) fail(file, table.table, "RLS_OR_TRIGGER_DISABLED");
        else if (words(tail, "force", "row", "level", "security")) {
          table.forced = true;
          if (table.kind === "administrative") fail(file, table.table, "COUNTERS_FORCE_RLS_CHANGED");
        } else if (words(tail, "no", "force", "row", "level", "security")) table.forced = false;
        else if (["owner", "rename", "inherit", "attach", "detach"].some((v) => tail.some((token) => keyword(token, v)))) fail(file, table.table, "CONTRACT_IDENTITY_OR_INHERITANCE_CHANGED");
        else unknown(file, "ALTER_CONTRACT_REQUIRES_REPLAY");
        continue;
      }
      if (["create", "alter", "drop"].some((v) => keyword(tokens[0], v)) && keyword(tokens[1], "policy")) {
        const on = tokens.findIndex((token) => keyword(token, "on"));
        const table = matching(relation(tokens, on + 1));
        if (!table) continue;
        if (isPrelude) { unknown(file, "PRELUDE_POLICY_REQUIRES_REPLAY"); continue; }
        if (!table.creationFile) { unknown(file, "POLICY_BEFORE_DECLARED_CREATION"); continue; }
        if (!keyword(tokens[0], "create")) { fail(file, table.table, "POLICY_CONTRACT_ALTERED"); continue; }
        if (table.kind === "administrative") { fail(file, table.table, "COUNTERS_POLICY_PRESENT"); continue; }
        const r = relation(tokens, on + 1);
        const tail = tokens.slice(r.next);
        const using = tail.findIndex((t) => keyword(t, "using"));
        const check = tail.findIndex((t, i) => keyword(t, "with") && keyword(tail[i + 1], "check"));
        const usingEnd = endParenthesis(tail, using + 1), checkEnd = endParenthesis(tail, check + 2);
        const before = tail.slice(0, using);
        const shape = words(before, "for", "all", "to", "public") && before.length === 4
          && usingEnd === check - 1 && checkEnd === tail.length - 1
          && literalFalse(tail.slice(using + 2, usingEnd)) && literalFalse(tail.slice(check + 3, checkEnd));
        if (!shape) fail(file, table.table, "LEDGER_POLICY_NOT_SINGLE_PUBLIC_FALSE");
        const policyName = identifier(tokens[2]);
        if (!policyName || table.policies.has(policyName)) fail(file, table.table, "POLICY_IDENTITY_AMBIGUOUS");
        table.policies.set(policyName, { file, valid: shape });
        continue;
      }
      if ((keyword(tokens[1], "role") || keyword(tokens[1], "user"))
          && keyword(tokens[0], "alter") && PRODUCTS.includes(identifier(tokens[2]))
          && tokens.slice(3).some((token) => ["superuser", "bypassrls", "createrole", "replication"].some((v) => keyword(token, v)))) {
        fail(file, null, "PRODUCT_ROLE_ELEVATED"); continue;
      }
      // Unknown SQL is not silently proved harmless. The fresh replay is always
      // mandatory, even when every direct clause above has the expected form.
      if (tokens.some((token) => targetNames.includes(identifier(token))) && ["drop", "alter"].some((v) => keyword(tokens[0], v))) {
        for (const table of targetNames.filter((name) => tokens.some((token) => identifier(token) === name))) fail(file, table, "CONTRACT_DROPPED_OR_UNSUPPORTED_DDL");
      } else if (["select", "with", "perform", "set", "reset", "reassign"].some((v) => keyword(tokens[0], v))
          || words(tokens, "alter", "default", "privileges") || ["role", "user", "schema"].some((v) => keyword(tokens[1], v))) {
        unknown(file, "SESSION_GLOBAL_OR_DATA_EFFECT_REQUIRES_REPLAY");
      }
    }
    if (!isPrelude) for (const table of states.values()) if (table.creationFile === file) {
      const required = table.kind === "administrative" ? ["PUBLIC", ...PRODUCTS] : PRODUCTS;
      for (const principal of required) if (!table.revokes.has(principal)) fail(file, table.table, "CREATION_REVOKE_MISSING_" + principal.toUpperCase());
      if (table.kind === "administrative" && !BACKEND.every((p) => table.backend.has(p))) fail(file, table.table, "CREATION_SERVICE_PRIVILEGE_MISSING");
      if (table.kind === "deny-policy" && !table.rls) fail(file, table.table, "CREATION_LEDGER_RLS_MISSING");
    }
  }
  for (const source of prelude) inspect(source, true);
  for (const source of history) inspect(source, false);
  for (const table of states.values()) {
    if (!table.creationFile) fail("drizzle/migrations/meta/_journal.json", table.table, "CONTRACT_CREATION_MISSING");
    if (!table.rls) fail(table.creationFile ?? "", table.table, "FINAL_RLS_MISSING");
    if (table.kind === "deny-policy" && (table.policies.size !== 1 || ![...table.policies.values()].every((p) => p.valid))) fail(table.creationFile ?? "", table.table, "FINAL_LEDGER_POLICY_MISMATCH");
    if (table.kind === "administrative" && !BACKEND.every((p) => table.backend.has(p))) fail(table.creationFile ?? "", table.table, "FINAL_SERVICE_PRIVILEGE_MISSING");
  }
  const contracts = [...states.values()].map((table) => ({
    table: table.table, kind: table.kind, creationFile: table.creationFile,
    authoredProperties: { rls: table.rls, revokedPrincipals: [...table.revokes].sort(), backendPrivileges: [...table.backend].sort(), policyCount: table.policies.size },
    status: failures.some((v) => v.table === table.table || v.table === null) ? "FAIL" : "REPLAY_REQUIRED",
  }));
  const eligibleLegacyFindings = [...states.values()].filter((table) => table.eligible && table.directCreationShape
    && !failures.some((v) => v.table === table.table || v.table === null)).map((table) => ({
    file: table.creationFile, table: table.table,
    missing: table.kind === "administrative"
      ? ["ALTER TABLE public." + table.table + " ENABLE ROW LEVEL SECURITY", "CREATE POLICY ON public." + table.table]
      : ["GRANT ON public." + table.table],
  }));
  return { status: failures.length ? "FAIL" : "REPLAY_REQUIRED", contracts, failures, indeterminate,
    eligibleLegacyFindings, requiresFreshReplay: true,
    scope: "Direct authored contract clauses only; no effective ACL, bootstrap, RPC or procedural proof" };
}

function regular(root, relative) {
  const path = join(root, relative), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Canonical input must be a regular file");
  return readFileSync(path, "utf8");
}
export function loadCanonicalContractHistory(root = process.cwd()) {
  for (const directory of ["drizzle", "drizzle/migrations", "drizzle/migrations/meta", "supabase", "supabase/migrations"]) {
    const stat = lstatSync(join(root, directory));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Canonical input must use real directories");
  }
  const names = readdirSync(join(root, "drizzle/migrations")).filter((name) => /\.sql$/i.test(name));
  const journal = JSON.parse(regular(root, "drizzle/migrations/meta/_journal.json"));
  const entries = validateCanonicalJournal(journal, names); // Structure only, no receipt exclusion or content hashes.
  const files = entries.map((entry) => "drizzle/migrations/" + entry.tag + ".sql");
  const preludeFiles = readdirSync(join(root, "supabase/migrations")).filter((name) => /\.sql$/i.test(name)).sort();
  const versions = preludeFiles.map((name) => /^(\d{14})_/.exec(name)?.[1]);
  if (versions.some((v) => !v) || new Set(versions).size !== versions.length) throw new Error("Supabase versions must be unambiguous canonical timestamps");
  return { history: files.map((file) => ({ file, sql: regular(root, file) })),
    prelude: preludeFiles.map((name) => ({ file: "supabase/migrations/" + name, sql: regular(root, "supabase/migrations/" + name) })),
    files, journal };
}

// Preserve every original annotation, but distinguish exactly the three
// uniform-per-file observations eligible for the current composite contract.
// Unparsed output or another diagnostic is never accepted by this classifier.
export function classifyLegacyDiagnostics(raw, result) {
  const eligible = [], blocking = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const match = /^::error file=([^:]+)::public\.([a-z_][a-z0-9_]*) creada pero faltan: (.+)$/.exec(line);
    const disposition = match && result.eligibleLegacyFindings.find((v) => v.file === normalizedPath(match[1])
      && v.table === match[2] && v.missing.join(", ") === match[3]);
    if (disposition && result.status !== "FAIL") eligible.push({ file: disposition.file, table: disposition.table, diagnostic: line });
    else blocking.push(line);
  }
  return { eligible, blocking, status: blocking.length || result.status === "FAIL" ? "FAIL" : "REPLAY_REQUIRED" };
}
