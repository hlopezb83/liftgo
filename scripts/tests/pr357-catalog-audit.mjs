import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Review aid for a harness-owned disposable PostgreSQL 17 cluster. This module
// has no CLI, URL, environment fallback, connection creation or business query.
// No catalog result alone is evidence that a full Supabase replay succeeded.
export const TARGET_TABLES = [
  "organization_document_counters",
  "storage_object_migrations",
  "storage_reference_migrations",
];
const PRODUCT_ROLES = ["anon", "authenticated"];
const REQUIRED_ROLES = [...PRODUCT_ROLES, "service_role"];
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];
const TABLES_CTE = `
  SELECT c.*, n.nspname AS schema_name, r.rolname AS owner_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
  WHERE n.nspname = 'public' AND c.relname IN (
    'organization_document_counters', 'storage_object_migrations', 'storage_reference_migrations'
  )`;
const CHECKED_ROLES_CTE = `
  SELECT r.oid,r.rolname FROM pg_catalog.pg_roles r
  WHERE r.rolname IN ('anon','authenticated','service_role')
    OR r.oid IN (SELECT relowner FROM target)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles product
      WHERE product.rolname IN ('anon','authenticated')
        AND pg_catalog.pg_has_role(product.oid,r.oid,'SET'))`;

function guardLocalMarker({ clusterDirectory, nonce } = {}) {
  if (typeof clusterDirectory !== "string" || typeof nonce !== "string"
      || !/^[0-9a-f-]{36}$/i.test(nonce)) {
    throw new Error("Explicit disposable cluster directory and UUID marker required");
  }
  const absolute = resolve(clusterDirectory);
  if (absolute !== realpathSync(absolute)
      || resolve(absolute, "..") !== realpathSync(tmpdir())
      || !/^liftgo-pr357-pg-[A-Za-z0-9_-]+$/.test(basename(absolute))) {
    throw new Error("Only a newly owned /tmp/liftgo-pr357-pg-* cluster is supported");
  }
  const directory = statSync(absolute);
  const markerPath = join(absolute, ".liftgo-pr357-temporary.json");
  const markerStat = statSync(markerPath);
  if (!directory.isDirectory() || (directory.mode & 0o077) !== 0
      || !markerStat.isFile() || realpathSync(markerPath) !== markerPath
      || (markerStat.mode & 0o077) !== 0
      || directory.uid !== process.getuid() || markerStat.uid !== process.getuid()) {
    throw new Error("Disposable cluster and marker must be private and locally owned");
  }
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.purpose !== "pr357-catalog-validation" || marker.nonce !== nonce) {
    throw new Error("Disposable cluster marker does not match this harness");
  }
  return join(absolute, "data");
}

/** Reject incomplete or type-coerced evidence before interpreting any ACL.
 * This validates the fixed query result shape, not an arbitrary JSON status. */
export function validateCatalogSnapshot(snapshot) {
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const string = (value) => typeof value === "string" && value.length > 0;
  const require = (condition) => { if (!condition) throw new Error("Incomplete or malformed catalog snapshot"); };
  const fields = (row, strings, booleans = []) => {
    require(record(row) && strings.every((key) => string(row[key]))
      && booleans.every((key) => typeof row[key] === "boolean"));
  };
  const unique = (rows, key) => require(new Set(rows.map(key)).size === rows.length);
  require(record(snapshot));
  for (const name of Object.keys(CATALOG_QUERIES)) require(Array.isArray(snapshot[name]));
  for (const row of snapshot.tables) {
    fields(row, ["name", "kind", "owner"], ["rls_enabled", "rls_forced"]);
    require(TARGET_TABLES.includes(row.name));
  }
  unique(snapshot.tables, (r) => r.name);
  for (const row of snapshot.roles) fields(row, ["name"], ["superuser", "bypass_rls", "create_role", "create_database", "replication", "inherit", "login"]);
  unique(snapshot.roles, (r) => r.name);
  const roleNames = new Set(snapshot.roles.map((r) => r.name));
  const tableNames = new Set(snapshot.tables.map((r) => r.name));
  for (const row of snapshot.policies) {
    fields(row, ["table", "name", "command"], ["permissive", "using_false", "check_false", "roles_public_only"]);
    require(tableNames.has(row.table) && Array.isArray(row.roles) && row.roles.length > 0 && row.roles.every(string));
    unique(row.roles, (r) => r);
    for (const key of ["using_expression_hash", "check_expression_hash"]) require(row[key] === null || (typeof row[key] === "string" && /^[0-9a-f]{32}$/.test(row[key])));
  }
  unique(snapshot.policies, (r) => `${r.table}\0${r.name}`);
  for (const [field, privileges] of [["table_acl", TABLE_PRIVILEGES], ["column_acl", COLUMN_PRIVILEGES]]) {
    for (const row of snapshot[field]) {
      fields(row, ["table", "grantee", "grantor", "privilege", ...(field === "column_acl" ? ["column"] : [])], ["is_grantable"]);
      require(tableNames.has(row.table) && privileges.includes(row.privilege));
    }
    unique(snapshot[field], (r) => [r.table, r.column ?? "", r.grantee, r.grantor, r.privilege].join("\0"));
  }
  for (const row of snapshot.role_reachability) {
    fields(row, ["from_role", "reachable_role"], ["member", "usage", "set_role"]);
    require(roleNames.has(row.from_role) && roleNames.has(row.reachable_role));
  }
  unique(snapshot.role_reachability, (r) => `${r.from_role}\0${r.reachable_role}`);
  const checkedRoles = new Set([...REQUIRED_ROLES.filter((r) => roleNames.has(r)), ...snapshot.tables.map((r) => r.owner),
    ...snapshot.role_reachability.filter((r) => PRODUCT_ROLES.includes(r.from_role) && r.set_role).map((r) => r.reachable_role)]);
  require([...checkedRoles].every((r) => roleNames.has(r)));
  for (const origin of checkedRoles) for (const target of roleNames) {
    require(snapshot.role_reachability.some((r) => r.from_role === origin && r.reachable_role === target));
  }
  for (const row of snapshot.role_reachability) require(checkedRoles.has(row.from_role));
  for (const row of snapshot.effective_privileges) {
    fields(row, ["table", "role", "scope", "privilege"], ["allowed"]);
    require(tableNames.has(row.table) && checkedRoles.has(row.role)
      && (row.scope === "table" ? TABLE_PRIVILEGES : row.scope === "column" ? COLUMN_PRIVILEGES : []).includes(row.privilege));
  }
  unique(snapshot.effective_privileges, (r) => [r.table, r.role, r.scope, r.privilege].join("\0"));
  for (const table of tableNames) for (const role of checkedRoles) {
    for (const [scope, privileges] of [["table", TABLE_PRIVILEGES], ["column", COLUMN_PRIVILEGES]]) for (const privilege of privileges) {
      require(snapshot.effective_privileges.some((r) => r.table === table && r.role === role && r.scope === scope && r.privilege === privilege));
    }
  }
  for (const row of snapshot.schema_privileges) {
    fields(row, ["role"], ["usage", "create"]); require(checkedRoles.has(row.role));
  }
  unique(snapshot.schema_privileges, (r) => r.role);
  require(snapshot.schema_privileges.length === checkedRoles.size);
  for (const row of snapshot.memberships) {
    fields(row, ["member", "role", "grantor"], ["admin_option", "inherit_option", "set_option"]);
    require([row.member, row.role, row.grantor].every((r) => roleNames.has(r)));
  }
  unique(snapshot.memberships, (r) => [r.member, r.role, r.grantor].join("\0"));
  for (const row of snapshot.public_schema_acl) fields(row, ["grantee", "grantor", "privilege"], ["is_grantable"]);
  unique(snapshot.public_schema_acl, (r) => [r.grantee, r.grantor, r.privilege].join("\0"));
  for (const row of snapshot.default_acl) fields(row, ["owner", "schema", "object_type", "grantee", "privilege"], ["is_grantable"]);
  unique(snapshot.default_acl, (r) => [r.owner, r.schema, r.object_type, r.grantee, r.privilege].join("\0"));
  for (const row of snapshot.inheritance) {
    fields(row, ["child_schema", "child_name", "parent_schema", "parent_name"], ["child_is_partition"]);
    require((row.child_schema === "public" && TARGET_TABLES.includes(row.child_name))
      || (row.parent_schema === "public" && TARGET_TABLES.includes(row.parent_name)));
  }
  unique(snapshot.inheritance, (r) => [r.child_schema, r.child_name, r.parent_schema, r.parent_name].join("\0"));
  return snapshot;
}

export function evaluateCatalog(snapshot) {
  const findings = [];
  const bypass = [];
  const add = (code, table, role, detail) => findings.push({ code, table, role, detail });
  for (const name of REQUIRED_ROLES) {
    if (!snapshot.roles.some((r) => r.name === name)) add("MISSING_ROLE", null, name, "Required role absent");
  }
  for (const name of TARGET_TABLES) {
    const tables = snapshot.tables.filter((t) => t.name === name);
    if (tables.length !== 1) {
      add("MISSING_OR_AMBIGUOUS_TABLE", name, null, "Expected one public table");
      continue;
    }
    const table = tables[0];
    if (table.kind !== "r") add("UNEXPECTED_RELATION_KIND", name, null, "Expected an ordinary table; partition descendants are outside this audit");
    if (!table.rls_enabled) add("RLS_DISABLED", name, null, "RLS is required");
    if (snapshot.inheritance?.some((r) => (r.child_schema === "public" && r.child_name === name)
        || (r.parent_schema === "public" && r.parent_name === name))) {
      add("INHERITANCE_EDGE_PRESENT", name, null, "Inherited/partition access through another relation is outside the closed table contract");
    }
    if (name === TARGET_TABLES[0] && table.rls_forced) {
      add("COUNTERS_FORCE_RLS_CHANGED", name, null, "Owner bypass is part of the documented SECURITY DEFINER contract; review needed");
    }
    const policies = snapshot.policies.filter((p) => p.table === name);
    for (const role of new Set([...REQUIRED_ROLES, table.owner])) {
      const attributes = snapshot.roles.find((r) => r.name === role);
      const inheritedOwner = snapshot.role_reachability.some((r) => r.from_role === role
        && r.reachable_role === table.owner && r.usage);
      bypass.push({ table: name, role, superuser: Boolean(attributes?.superuser),
        bypass_rls_attribute: Boolean(attributes?.bypass_rls), inherited_owner: inheritedOwner,
        owner_bypass_active: !table.rls_forced && (role === table.owner || inheritedOwner),
        rls_bypass_without_set_role: Boolean(attributes?.superuser || attributes?.bypass_rls
          || (!table.rls_forced && (role === table.owner || inheritedOwner))) });
    }
    if (name === TARGET_TABLES[0]) {
      if (policies.length !== 0) add("COUNTERS_POLICY_PRESENT", name, null, "Counters must have zero policies");
    } else if (policies.length !== 1 || !policies.every((p) => p.command === "*"
        && p.permissive && p.roles_public_only === true && p.roles.length === 1 && p.roles[0] === "PUBLIC"
        && p.using_false && p.check_false)) {
      // Conservative contract mismatch, not a claim every extra policy leaks.
      add("UNREVIEWED_LEDGER_POLICY", name, null, "Expected only one PUBLIC/FOR ALL/false deny policy; inspect every alternative");
    }
    for (const acl of [...snapshot.table_acl, ...snapshot.column_acl]) {
      if (acl.table === name && acl.grantee === "PUBLIC") {
        add("PUBLIC_ACL_PRESENT", name, "PUBLIC", `${acl.privilege}${acl.column ? " on column " + acl.column : ""}`);
      }
    }
    for (const role of PRODUCT_ROLES) {
      const assumedRoles = new Set([role, ...snapshot.role_reachability
        .filter((r) => r.from_role === role && r.set_role).map((r) => r.reachable_role)]);
      for (const assumedRole of assumedRoles) {
        const privileges = snapshot.effective_privileges.filter((p) => p.table === name && p.role === assumedRole);
        const expected = ["table:SELECT","table:INSERT","table:UPDATE","table:DELETE","table:TRUNCATE",
          "table:REFERENCES","table:TRIGGER","table:MAINTAIN","column:SELECT","column:INSERT","column:UPDATE","column:REFERENCES"];
        if (privileges.length !== expected.length || new Set(privileges.map((p) => `${p.scope}:${p.privilege}`)).size !== expected.length
            || !expected.every((key) => privileges.some((p) => `${p.scope}:${p.privilege}` === key))) {
          add("INCOMPLETE_PRIVILEGE_SNAPSHOT", name, role, `Missing/duplicate PostgreSQL 17 privilege checks for reachable role ${assumedRole}`);
        }
        for (const privilege of privileges.filter((p) => p.allowed)) {
          add("PRODUCT_PRIVILEGE_PRESENT", name, role, `${privilege.scope}:${privilege.privilege} via ${assumedRole}; includes PUBLIC and inherited ACLs`);
        }
        const elevated = snapshot.roles.find((r) => r.name === assumedRole);
        if (elevated?.create_role || elevated?.replication) {
          add("PRODUCT_ELEVATED_ATTRIBUTE", name, role, `CREATEROLE/REPLICATION reachable via ${assumedRole}`);
        }
        const ownerAccess = snapshot.role_reachability.filter((r) => r.from_role === assumedRole && r.reachable_role === table.owner);
        if (ownerAccess.length === 0) {
          add("INCOMPLETE_ROLE_REACHABILITY", name, role, `Owner inheritance check missing for reachable role ${assumedRole}`);
        }
        // Attributes are activated on SET ROLE, not inherited. An assumed role
        // can nevertheless inherit owner status/ACL from a third role even if
        // the original product role cannot SET ROLE to that third role.
        if (assumedRole === table.owner || ownerAccess.some((r) => r.usage)
            || elevated?.superuser || elevated?.bypass_rls) {
          add("PRODUCT_BYPASS_REACHABLE", name, role, `Owner/SUPERUSER/BYPASSRLS reachable via ${assumedRole}`);
        }
      }
    }
  }
  for (const role of snapshot.roles.filter((r) => PRODUCT_ROLES.includes(r.name))) {
    if (role.superuser || role.bypass_rls || role.create_role || role.replication) {
      add("PRODUCT_ELEVATED_ATTRIBUTE", null, role.name, "Unexpected SUPERUSER/BYPASSRLS/CREATEROLE/REPLICATION attribute");
    }
  }
  for (const privilege of ["SELECT", "INSERT", "UPDATE"]) {
    if (!snapshot.effective_privileges.some((p) => p.table === TARGET_TABLES[0]
        && p.role === "service_role" && p.scope === "table" && p.privilege === privilege && p.allowed)) {
      add("COUNTERS_SERVICE_PRIVILEGE_MISSING", TARGET_TABLES[0], "service_role", privilege);
    }
  }
  if (!bypass.some((b) => b.table === TARGET_TABLES[0] && b.role === "service_role" && b.rls_bypass_without_set_role)) {
    add("COUNTERS_SERVICE_BYPASS_MISSING", TARGET_TABLES[0], "service_role", "ACLs alone cannot access counters with RLS and zero policies");
  }
  if (!snapshot.schema_privileges.some((p) => p.role === "service_role" && p.usage)) {
    add("COUNTERS_SERVICE_SCHEMA_USAGE_MISSING", TARGET_TABLES[0], "service_role", "Public schema USAGE required in addition to table ACLs");
  }
  return { status: findings.length === 0 ? "PASS" : "FAIL", findings, bypass,
    validation_scope: "Catalog contract only; actual SQL collection/replay and row operations require separate evidence" };
}

export const CATALOG_IDENTITY_SQL = `SELECT current_database() AS database,
      current_setting('data_directory') AS data_directory,
      current_setting('server_version_num')::integer AS server_version_num,
      current_setting('transaction_read_only') AS transaction_read_only,
      inet_server_addr()::text AS server_address, current_user AS current_user, session_user AS session_user`;

// Fixed catalog-only statements shared by independently guarded native and Docker harnesses.
export const CATALOG_QUERIES = Object.freeze({
  tables: `WITH target AS (${TABLES_CTE})
      SELECT relname AS name, relkind AS kind, owner_name AS owner,
        relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced FROM target ORDER BY relname`,
  inheritance: `WITH target AS (${TABLES_CTE})
      SELECT cn.nspname AS child_schema,c.relname AS child_name,pn.nspname AS parent_schema,p.relname AS parent_name,
        c.relispartition AS child_is_partition
      FROM pg_catalog.pg_inherits i
      JOIN pg_catalog.pg_class c ON c.oid=i.inhrelid JOIN pg_catalog.pg_namespace cn ON cn.oid=c.relnamespace
      JOIN pg_catalog.pg_class p ON p.oid=i.inhparent JOIN pg_catalog.pg_namespace pn ON pn.oid=p.relnamespace
      WHERE i.inhrelid IN (SELECT oid FROM target) OR i.inhparent IN (SELECT oid FROM target)
      ORDER BY cn.nspname,c.relname,pn.nspname,p.relname`,
  roles: `SELECT rolname AS name, rolsuper AS superuser,
      rolbypassrls AS bypass_rls, rolcreaterole AS create_role, rolcreatedb AS create_database,
      rolreplication AS replication, rolinherit AS inherit, rolcanlogin AS login
      FROM pg_catalog.pg_roles ORDER BY rolname`,
  policies: `WITH target AS (${TABLES_CTE})
      SELECT t.relname AS table, p.polname AS name, p.polcmd AS command, p.polpermissive AS permissive,
        p.polroles = ARRAY[0::oid] AS roles_public_only,
        ARRAY(SELECT (CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END)::text
          FROM unnest(p.polroles) AS role_oid ORDER BY role_oid) AS roles,
        COALESCE(regexp_replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid), '[()[:space:]]', '', 'g') = 'false', false) AS using_false,
        COALESCE(regexp_replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid), '[()[:space:]]', '', 'g') = 'false', false) AS check_false,
        md5(pg_catalog.pg_get_expr(p.polqual,p.polrelid)) AS using_expression_hash,
        md5(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) AS check_expression_hash
      FROM target t JOIN pg_catalog.pg_policy p ON p.polrelid = t.oid ORDER BY t.relname,p.polname`,
  table_acl: `WITH target AS (${TABLES_CTE})
      SELECT t.relname AS table, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
        pg_catalog.pg_get_userbyid(a.grantor) AS grantor, a.privilege_type AS privilege, a.is_grantable
      FROM target t CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) a
      ORDER BY t.relname,grantee,privilege`,
  column_acl: `WITH target AS (${TABLES_CTE})
      SELECT t.relname AS table, c.attname AS column, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
        pg_catalog.pg_get_userbyid(a.grantor) AS grantor, a.privilege_type AS privilege, a.is_grantable
      FROM target t JOIN pg_catalog.pg_attribute c ON c.attrelid = t.oid AND c.attnum > 0 AND NOT c.attisdropped
      CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a ORDER BY t.relname,c.attname,grantee,privilege`,
  effective_privileges: `WITH target AS (${TABLES_CTE}), checked_roles AS (${CHECKED_ROLES_CTE}),
      privileges AS (SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS privilege)
      SELECT t.relname AS table, r.rolname AS role, 'table' AS scope, p.privilege,
        pg_catalog.has_table_privilege(r.oid,t.oid,p.privilege) AS allowed FROM target t CROSS JOIN checked_roles r CROSS JOIN privileges p
      UNION ALL SELECT t.relname,r.rolname,'column',p.privilege,
        pg_catalog.has_any_column_privilege(r.oid,t.oid,p.privilege) FROM target t CROSS JOIN checked_roles r
        CROSS JOIN (SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege) p
      ORDER BY 1,2,3,4`,
  role_reachability: `WITH target AS (${TABLES_CTE}), checked_roles AS (${CHECKED_ROLES_CTE})
      SELECT origin.rolname AS from_role, elevated.rolname AS reachable_role,
      pg_catalog.pg_has_role(origin.oid,elevated.oid,'MEMBER') AS member,
      pg_catalog.pg_has_role(origin.oid,elevated.oid,'USAGE') AS usage,
      pg_catalog.pg_has_role(origin.oid,elevated.oid,'SET') AS set_role
      FROM checked_roles origin CROSS JOIN pg_catalog.pg_roles elevated
      ORDER BY origin.rolname,elevated.rolname`,
  memberships: `SELECT pg_catalog.pg_get_userbyid(m.member) AS member,
      pg_catalog.pg_get_userbyid(m.roleid) AS role, pg_catalog.pg_get_userbyid(m.grantor) AS grantor,
      m.admin_option,m.inherit_option,m.set_option FROM pg_catalog.pg_auth_members m ORDER BY 1,2,3`,
  public_schema_acl: `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
      pg_catalog.pg_get_userbyid(a.grantor) AS grantor,a.privilege_type AS privilege,a.is_grantable
      FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname='public' ORDER BY 1,3`,
  schema_privileges: `WITH target AS (${TABLES_CTE}), checked_roles AS (${CHECKED_ROLES_CTE})
      SELECT r.rolname AS role, pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
        pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') AS create
      FROM checked_roles r CROSS JOIN pg_catalog.pg_namespace n WHERE n.nspname='public' ORDER BY r.rolname`,
  default_acl: `SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,
      COALESCE(n.nspname,'(all schemas)') AS schema,d.defaclobjtype AS object_type,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
      a.privilege_type AS privilege,a.is_grantable FROM pg_catalog.pg_default_acl d
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
      WHERE d.defaclnamespace=0 OR n.nspname='public' ORDER BY 1,2,3,4,5`,
});

export async function collectCatalog(tx) {
  const snapshot = {};
  for (const [key, query] of Object.entries(CATALOG_QUERIES)) snapshot[key] = await tx.unsafe(query);
  return snapshot;
}

export async function auditTemporaryCatalog(sql, options) {
  const expectedDataDirectory = guardLocalMarker(options);
  // The native ownership/identity guard is unchanged; Docker has a separate guard.
  return sql.begin("read only", async (tx) => {
    const [identity] = await tx.unsafe(CATALOG_IDENTITY_SQL);
    if (identity.data_directory !== expectedDataDirectory || identity.database !== "pr357_catalog_validation"
        || ![null, "127.0.0.1", "::1"].includes(identity.server_address)
        || identity.transaction_read_only !== "on"
        || identity.server_version_num < 170000 || identity.server_version_num >= 180000) {
      throw new Error("Connection is not the marked disposable PostgreSQL 17 validation database");
    }
    const snapshot = await collectCatalog(tx);
    validateCatalogSnapshot(snapshot);
    return { ...evaluateCatalog(snapshot), snapshot, evidence_scope: "Read-only catalog of the marked temporary PostgreSQL 17 database; replay provenance must be supplied separately" };
  });
}
