// Owns a fresh localhost-only database. Never accepts an existing database URL.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
if (process.env.RUN_LOCAL_OPERATIONS_TESTS !== "1")
  throw Error("Opt in with RUN_LOCAL_OPERATIONS_TESTS=1.");
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin))
  throw Error(
    "PG_BIN must be an absolute directory of trusted PostgreSQL binaries.",
  );
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const dir = mkdtempSync(path.join(os.tmpdir(), "liftgo-op0115-"));
const server = net.createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const run = (name, args) =>
  execFileSync(path.join(bin, name), args, {
    encoding: "utf8",
    timeout: 30000,
  });
const org = "10000000-0000-0000-0000-000000000001",
  other = "10000000-0000-0000-0000-000000000002";
const booking = "20000000-0000-0000-0000-000000000001",
  unit = "30000000-0000-0000-0000-000000000001";
const inspection = "40000000-0000-0000-0000-000000000001",
  damage = "60000000-0000-0000-0000-000000000001";
const maintenance = "70000000-0000-0000-0000-000000000001";
const extract = (file, name, tag) => {
  const source = readFileSync(path.join(root, file), "utf8");
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`),
    end = source.indexOf(tag, start);
  assert.ok(start >= 0 && end > start, `Missing exact function ${name}`);
  return source.slice(start, end + tag.length);
};
let started = false,
  sql,
  assertions = 0;
const pass = (label) => {
  assertions++;
  console.log(`PASS ${label}`);
};
const rejected = async (query, code, pattern) => {
  await assert.rejects(
    sql.unsafe(query),
    (error) => error.code === code && (!pattern || pattern.test(error.message)),
  );
};
try {
  // PostgreSQL forbids demoting the bootstrap role. Use a separate local-only
  // bootstrap, then make the migration owner match the non-superuser target.
  run("initdb", [
    "-D",
    `${dir}/data`,
    "-U",
    "acl_cluster_admin",
    "--auth=trust",
  ]);
  run("pg_ctl", [
    "-D",
    `${dir}/data`,
    "-l",
    `${dir}/postgres.log`,
    "-o",
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,
    "start",
  ]);
  started = true;
  sql = postgres({
    host: "127.0.0.1",
    port,
    username: "acl_cluster_admin",
    database: "postgres",
    max: 1,
    onnotice: () => {},
  });
  await sql.unsafe(
    "CREATE ROLE postgres SUPERUSER LOGIN; ALTER DATABASE postgres OWNER TO postgres; SET SESSION AUTHORIZATION postgres",
  );
  await sql.unsafe(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,is_active boolean NOT NULL DEFAULT true); INSERT INTO public.organizations(id) VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
    CREATE TYPE public.app_role AS ENUM('admin','administrativo','dispatcher','mechanic');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '50000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.org',true),''),'${org}')::uuid $$;
    CREATE FUNCTION public.current_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT public.current_internal_organization_id() $$;
    CREATE FUNCTION public.organization_scope_matches(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = public.current_internal_organization_id() $$;
    CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'admin')=$2::text $$;
    CREATE FUNCTION public.is_internal_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.booking_is_returned(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE bookings(id uuid PRIMARY KEY,organization_id uuid,forklift_id uuid,booking_number text,status text,return_status text,updated_at timestamptz DEFAULT now(),customer_id uuid,start_date date,end_date date,daily_rate numeric,monthly_rate numeric);
    CREATE TABLE forklifts(id uuid PRIMARY KEY,organization_id uuid,status text,updated_at timestamptz DEFAULT now());
    CREATE TABLE return_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,booking_id uuid,forklift_id uuid,inspection_number text,condition text,damage_notes text,damage_cost numeric,hours_used numeric,fuel_level text,inspected_at timestamptz,extra_hours numeric,suggested_extra_hour_charge numeric,inspected_by text,late_days numeric,suggested_late_charge numeric,created_at timestamptz DEFAULT now());
    CREATE TABLE damage_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inspection_id uuid REFERENCES return_inspections(id),organization_id uuid,forklift_id uuid,booking_id uuid,customer_id uuid,description text,estimated_cost numeric,status text,previous_forklift_status text,deleted_at timestamptz,deleted_by uuid,repaired_at timestamptz,invoice_id uuid,maintenance_log_id uuid,updated_at timestamptz DEFAULT now());
    CREATE TABLE deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid,forklift_id uuid,organization_id uuid,type text,status text,hours_reading numeric,completed_at timestamptz,scheduled_date date,scheduled_time time,created_at timestamptz DEFAULT now());
    CREATE TABLE contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid,organization_id uuid,status text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),max_hours_per_month numeric,extra_hour_rate numeric);
    CREATE TABLE maintenance_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),forklift_id uuid,organization_id uuid,deleted_at timestamptz,work_status text);
    CREATE TABLE status_logs(forklift_id uuid,from_status text,to_status text,note text,changed_by uuid,organization_id uuid);
    CREATE TABLE audit_logs(table_name text,record_id uuid,action text,old_data jsonb,new_data jsonb,user_id uuid,source text,organization_id uuid);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT INSERT,UPDATE ON deliveries TO authenticated; GRANT UPDATE ON damage_records TO authenticated;`);
  await sql.unsafe(
    extract(
      "drizzle/migrations/0102_admin_delivery_return_corrections.sql",
      "admin_correction_guard",
      "\n$$;",
    ),
  );
  await sql.unsafe(
    "REVOKE ALL ON FUNCTION public.admin_correction_guard() FROM PUBLIC,anon,authenticated",
  );
  await sql.unsafe(
    extract(
      "drizzle/migrations/0042_multi_org_bank_inspection_rpc_org_guard.sql",
      "correct_return_inspection",
      "\n$function$;",
    ),
  );
  await sql.unsafe(
    extract(
      "drizzle/migrations/0081_operational_lifecycle_guards.sql",
      "complete_return_inspection",
      "\n$function$;",
    ),
  );
  await sql.unsafe(`REVOKE ALL ON FUNCTION public.correct_return_inspection(uuid,text,text,text,numeric,numeric,text), public.complete_return_inspection(uuid,uuid,text,text,numeric,numeric,text,text,timestamptz) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.correct_return_inspection(uuid,text,text,text,numeric,numeric,text), public.complete_return_inspection(uuid,uuid,text,text,numeric,numeric,text,text,timestamptz) TO authenticated;`);
  await sql.unsafe(
    extract(
      "drizzle/migrations/0030_multi_org_onboarding_and_customer_scope.sql",
      "enforce_organization_write_context",
      "\n$$;",
    ),
  );
  await sql.unsafe(
    extract(
      "supabase/migrations/20260910023735_7445b1eb-6d15-4e66-b923-57e018a34cc5.sql",
      "guard_archived_damage_immutable",
      "\n$function$;",
    ),
  );
  await sql.unsafe(
    "CREATE TRIGGER trg_damage_archived_immutable BEFORE UPDATE ON damage_records FOR EACH ROW EXECUTE FUNCTION public.guard_archived_damage_immutable()",
  );
  await sql.unsafe(
    "CREATE FUNCTION public.ensure_forklift_maintenance_for_open_damage(uuid,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$",
  );
  await sql.unsafe(
    extract(
      "drizzle/migrations/0041_multi_org_supplier_damage_rpc_org_guard.sql",
      "restore_damage_record",
      "\n$function$;",
    ),
  );
  // Model the pre-existing target functions before applying 0115. The ACL
  // regression must not accidentally replace the source's real function bodies.
  for (const [file, name, tag] of [
    [
      "supabase/migrations/20260903211605_481d235f-a11b-40c3-a88c-30611707e6c3.sql",
      "set_delivery_completed_at",
      "\n$$;",
    ],
    [
      "drizzle/migrations/0102_admin_delivery_return_corrections.sql",
      "void_return_inspection",
      "\n$$;",
    ],
    [
      "drizzle/migrations/0103_canonical_payment_invoice_currency.sql",
      "sync_invoice_status",
      "\n$function$;",
    ],
  ])
    await sql.unsafe(extract(file, name, tag));
  // These DEFAULT PRIVILEGES changes are fixtures in this disposable cluster
  // only. Include global/schema ACLs, an inherited role, and a quoted role name.
  await sql.unsafe(`
    CREATE ROLE sandbox_exec_fixture; CREATE ROLE sandbox_exec;
    CREATE ROLE "qa global ""quoted"""; CREATE ROLE sandbox_inherited;
    GRANT sandbox_exec_fixture TO sandbox_inherited;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT,INSERT ON TABLES TO sandbox_exec_fixture,sandbox_exec;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      GRANT SELECT ON TABLES TO "qa global ""quoted""";
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role,sandbox_exec_fixture;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres
      GRANT EXECUTE ON FUNCTIONS TO "qa global ""quoted""";
    REVOKE ALL ON FUNCTION public.set_delivery_completed_at(),public.guard_archived_damage_immutable()
      FROM PUBLIC,anon,authenticated;
    REVOKE ALL ON FUNCTION public.void_return_inspection(uuid,text),public.sync_invoice_status(uuid)
      FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.void_return_inspection(uuid,text),public.sync_invoice_status(uuid)
      TO authenticated;
    GRANT EXECUTE ON FUNCTION public.set_delivery_completed_at(),public.guard_archived_damage_immutable(),
      public.void_return_inspection(uuid,text),public.sync_invoice_status(uuid)
      TO service_role,sandbox_exec_fixture,"qa global ""quoted""";
    GRANT authenticated,anon TO postgres;
    ALTER ROLE postgres NOSUPERUSER BYPASSRLS;
  `);
  const aclSnapshot = async (db = sql) => {
    const [snapshot] = await db.unsafe(`SELECT
      (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d) AS defaults,
      (SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text) ORDER BY p.oid)
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','auth') AND p.oid NOT IN (
           COALESCE(to_regprocedure('public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)')::oid,0),
           COALESCE(to_regprocedure('public.recalculate_return_usage_charge()')::oid,0))) AS functions,
      (SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl::text) ORDER BY c.oid)
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.oid IS DISTINCT FROM to_regclass('public.return_inspection_usage_bases')::oid
           AND c.relkind IN ('r','p')) AS tables`);
    return snapshot;
  };
  const definitionSnapshot = async () =>
    Array.from(
      await sql.unsafe(`
    SELECT oid,pg_get_functiondef(oid) AS definition FROM pg_proc
     WHERE oid IN ('public.set_delivery_completed_at()'::regprocedure,
       'public.guard_archived_damage_immutable()'::regprocedure,
       'public.void_return_inspection(uuid,text)'::regprocedure,
       'public.sync_invoice_status(uuid)'::regprocedure) ORDER BY oid`),
    );
  const ownerOnly = async (db = sql) => {
    const rows = await db.unsafe(`WITH targets AS (
      SELECT 'table' AS kind,c.relowner AS owner,COALESCE(c.relacl,acldefault('r',c.relowner)) AS acl
        FROM pg_class c WHERE c.oid=to_regclass('public.return_inspection_usage_bases')
      UNION ALL
      SELECT p.proname,p.proowner,COALESCE(p.proacl,acldefault('f',p.proowner)) FROM pg_proc p
       WHERE p.oid IN (to_regprocedure('public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)'),
         to_regprocedure('public.recalculate_return_usage_charge()')))
      SELECT kind,pg_get_userbyid(owner) AS owner,
        EXISTS(SELECT 1 FROM aclexplode(acl) a WHERE a.grantee<>owner) AS non_owner,
        EXISTS(SELECT 1 FROM aclexplode(acl) a WHERE a.grantee=owner) AS owner_grant
      FROM targets ORDER BY kind`);
    assert.equal(rows.length, 3, "All three private objects must exist");
    for (const row of rows) {
      assert.equal(row.owner, "postgres");
      assert.equal(row.non_owner, false, row.kind);
      assert.equal(row.owner_grant, true, row.kind);
    }
    const privileges = await db.unsafe(`SELECT rolname,
      has_table_privilege(oid,'public.return_inspection_usage_bases','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
      has_function_privilege(oid,'public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)','EXECUTE') AS basis,
      has_function_privilege(oid,'public.recalculate_return_usage_charge()','EXECUTE') AS recalculate
      FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','sandbox_exec_fixture','sandbox_exec','sandbox_inherited','qa global "quoted"')`);
    assert.equal(privileges.length, 7);
    for (const row of privileges) {
      assert.equal(
        row.table_access || row.basis || row.recalculate,
        false,
        row.rolname,
      );
    }
  };
  const beforeAcls = await aclSnapshot();
  const beforeDefinitions = await definitionSnapshot();
  // Positive control: prove the fixtures reproduce inherited default grants.
  // Remove PostgreSQL's implicit PUBLIC EXECUTE from the probe so it cannot
  // mask missing explicit global/schema grants or the role inheritance check.
  await sql.begin(async (tx) => {
    await tx.unsafe(
      "CREATE TABLE public.acl_default_probe(id integer); CREATE FUNCTION public.acl_default_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'; REVOKE EXECUTE ON FUNCTION public.acl_default_probe() FROM PUBLIC",
    );
    const [probe] = await tx.unsafe(`SELECT
      has_table_privilege('sandbox_exec','public.acl_default_probe','SELECT,INSERT') AS table_access,
      has_function_privilege('sandbox_inherited','public.acl_default_probe()','EXECUTE') AS inherited_function,
      has_function_privilege('qa global "quoted"','public.acl_default_probe()','EXECUTE') AS global_function`);
    assert.deepEqual(probe, {
      table_access: true,
      inherited_function: true,
      global_function: true,
    });
    await tx.unsafe(
      "DROP TABLE public.acl_default_probe; DROP FUNCTION public.acl_default_probe()",
    );
  });
  pass(
    "ACL positive control reproduces global/schema/extra-role default grants",
  );
  const migration = readFileSync(
    path.join(
      root,
      "drizzle/migrations/0115_operational_audit_corrections.sql",
    ),
    "utf8",
  );
  await sql.unsafe(
    "CREATE TEMP TABLE acl_migration_ledger(id serial PRIMARY KEY, hash text); INSERT INTO acl_migration_ledger(hash) VALUES('preserved-prefix')",
  );
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await ownerOnly(tx);
      assert.deepEqual(await aclSnapshot(tx), beforeAcls);
      await tx.unsafe(
        "INSERT INTO acl_migration_ledger(hash) VALUES('0115-fixture'); DO $$ BEGIN RAISE EXCEPTION 'forced ACL migration rollback'; END $$",
      );
    }),
    (error) =>
      error.code === "P0001" &&
      /forced ACL migration rollback/.test(error.message),
  );
  assert.deepEqual(await aclSnapshot(), beforeAcls);
  assert.deepEqual(await definitionSnapshot(), beforeDefinitions);
  const [rolledBack] = await sql.unsafe(`SELECT
    to_regclass('public.return_inspection_usage_bases') IS NULL AS no_table,
    to_regprocedure('public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)') IS NULL AS no_basis,
    to_regprocedure('public.recalculate_return_usage_charge()') IS NULL AS no_recalculate,
    (SELECT count(*)::integer FROM acl_migration_ledger) AS ledger_rows`);
  assert.deepEqual(rolledBack, {
    no_table: true,
    no_basis: true,
    no_recalculate: true,
    ledger_rows: 1,
  });
  pass(
    "ACL forced failure rolls back objects, prior definitions/ACLs/defaults and ledger rows",
  );
  const seed = async () => {
    await sql.unsafe(`RESET ROLE; SELECT set_config('test.role','admin',false),set_config('test.org','${org}',false);
      TRUNCATE bookings,forklifts,return_inspections,damage_records,deliveries,contracts,maintenance_logs,audit_logs,status_logs CASCADE;
      INSERT INTO bookings(id,organization_id,forklift_id,booking_number,status,start_date,end_date,daily_rate,monthly_rate) VALUES('${booking}','${org}','${unit}','QA-RSV','confirmed','2026-09-01','2026-09-30',100,3000);
      INSERT INTO forklifts VALUES('${unit}','${org}','rented',now());
      INSERT INTO contracts(booking_id,organization_id,status,max_hours_per_month,extra_hour_rate) VALUES('${booking}','${org}','signed',200,10);
      INSERT INTO deliveries(booking_id,forklift_id,organization_id,type,status,completed_at,scheduled_date) VALUES('${booking}','${unit}','${org}','delivery','completed','2026-09-01T18:00:00Z','2026-09-01');`);
  };
  const complete = async (hours = 260) => {
    await sql.unsafe("SET ROLE authenticated");
    const [row] = await sql.unsafe(
      `SELECT public.complete_return_inspection('${booking}','${unit}','good',NULL,0,${hours},'Full','QA inspector','2026-09-30T18:00:00Z') AS id`,
    );
    return row.id;
  };
  const correct = (id, hours) =>
    sql.unsafe(
      `SELECT public.correct_return_inspection('${id}','QA corrected usage',NULL,NULL,NULL,${hours},NULL)`,
    );
  const usage = async () =>
    (
      await sql.unsafe(
        "SELECT hours_used,extra_hours,suggested_extra_hour_charge FROM return_inspections",
      )
    )[0];
  // Real old completion before migration proves that existing 260/60/600 data
  // can be corrected, rather than replacing the original defect with a blocker.
  await seed();
  const legacyId = await complete();
  await sql.unsafe("RESET ROLE");
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
    await ownerOnly(tx);
    assert.deepEqual(await aclSnapshot(tx), beforeAcls);
  });
  await ownerOnly();
  assert.deepEqual(await aclSnapshot(), beforeAcls);
  const [actor] = await sql.unsafe(
    "SELECT current_user AS actor,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.deepEqual(actor, {
    actor: "postgres",
    rolsuper: false,
    rolbypassrls: true,
  });
  const [guard] = await sql.unsafe(
    "SELECT prosecdef FROM pg_proc WHERE oid='public.guard_archived_damage_immutable()'::regprocedure",
  );
  assert.equal(guard.prosecdef, false);
  const syncBefore = beforeDefinitions.find((row) =>
    row.definition.includes("FUNCTION public.sync_invoice_status("),
  );
  assert.equal(
    (await definitionSnapshot()).find((row) => row.oid === syncBefore.oid)
      .definition,
    syncBefore.definition,
  );
  pass(
    "ACL exactly three new objects are owner-only; prior ACLs/defaults and sync body preserved as non-superuser postgres",
  );
  const aclGate = readFileSync(
    path.join(root, "supabase/tests/rls/operational_usage_owner_acl_0115.sql"),
    "utf8",
  ).replace(/^\\set[^\n]*\n/gm, "");
  await sql.unsafe(aclGate);
  pass("ACL full-schema SQL gate also passes in the disposable focused schema");
  await sql.unsafe(
    "CREATE TRIGGER trg_set_delivery_completed_at BEFORE INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION public.set_delivery_completed_at()",
  );
  await sql.unsafe("SET ROLE authenticated");
  await correct(legacyId, 100);
  assert.equal(Number((await usage()).hours_used), 100);
  assert.equal((await usage()).extra_hours, null);
  assert.equal((await usage()).suggested_extra_hour_charge, null);

  pass(
    "OP05 legacy real completion 260/60/600 corrects to 100/no excess/no charge",
  );
  await correct(legacyId, 300);
  assert.equal(Number((await usage()).extra_hours), 100);
  assert.equal(Number((await usage()).suggested_extra_hour_charge), 1000);
  pass("OP05 correction upward recalculates after a downward correction");
  await seed();
  const id = await complete();
  assert.equal(Number((await usage()).suggested_extra_hour_charge), 600);
  await sql.unsafe(
    "RESET ROLE; UPDATE contracts SET extra_hour_rate=99,max_hours_per_month=50,updated_at=now(); UPDATE bookings SET end_date='2026-11-30',updated_at=now(); SET ROLE authenticated",
  );
  await correct(id, 300);
  assert.equal(Number((await usage()).extra_hours), 100);
  assert.equal(Number((await usage()).suggested_extra_hour_charge), 1000);
  pass("OP05 changed contract and booking do not reprice an existing snapshot");
  await correct(id, 200);
  assert.equal((await usage()).extra_hours, null);
  assert.equal((await usage()).suggested_extra_hour_charge, null);
  pass("OP05 exact allowance clears the suggested charge");
  await rejected(
    `SELECT public.correct_return_inspection('${id}','QA negative',NULL,NULL,NULL,-1,NULL)`,
    "23514",
  );
  pass("OP05 negative hours remain rejected");
  await sql.unsafe(`SELECT set_config('test.org','${other}',false)`);
  await rejected(
    `SELECT public.correct_return_inspection('${id}','QA other org',NULL,NULL,NULL,400,NULL)`,
    "P0002",
  );
  pass("OP05 foreign organization cannot correct inspection");
  await sql.unsafe(
    `SELECT set_config('test.org','${org}',false),set_config('test.role','dispatcher',false)`,
  );
  await rejected(
    `SELECT public.correct_return_inspection('${id}','QA non admin',NULL,NULL,NULL,400,NULL)`,
    "42501",
  );
  pass("OP05 admin-only correction remains enforced");
  // Legacy without reliable historical pricing must not quietly use current rates.
  await seed();
  await sql.unsafe(
    "ALTER TABLE return_inspections DISABLE TRIGGER trg_recalculate_return_usage_charge",
  );
  const unknown = await complete();
  await sql.unsafe(
    "RESET ROLE; ALTER TABLE return_inspections ENABLE TRIGGER trg_recalculate_return_usage_charge; UPDATE contracts SET extra_hour_rate=77,updated_at=now(); SET ROLE authenticated",
  );
  await rejected(
    `SELECT public.correct_return_inspection('${unknown}','QA unknown basis',NULL,NULL,NULL,100,NULL)`,
    "23514",
    /base histórica/,
  );
  pass("OP05 legacy changed contract produces explicit safe review blocker");
  await rejected("SELECT * FROM public.return_inspection_usage_bases", "42501");
  pass("OP05 snapshot rates are not readable by authenticated clients");
  // Re-submitting an already-corrected legacy usage also repairs stale fields.
  await seed();
  await sql.unsafe(
    "ALTER TABLE return_inspections DISABLE TRIGGER trg_recalculate_return_usage_charge",
  );
  const stale = await complete();
  await sql.unsafe(
    "RESET ROLE; UPDATE return_inspections SET hours_used=100; ALTER TABLE return_inspections ENABLE TRIGGER trg_recalculate_return_usage_charge; SET ROLE authenticated",
  );
  await correct(stale, 100);
  assert.equal((await usage()).extra_hours, null);
  assert.equal((await usage()).suggested_extra_hour_charge, null);
  pass(
    "OP05 re-submitting identical corrected hours repairs a preexisting stale charge",
  );
  // OP02 actual dates: the authenticated role cannot provide arbitrary timestamps.
  await seed();
  await sql.unsafe("SET ROLE authenticated");
  const [historical] =
    await sql.unsafe(`INSERT INTO deliveries(booking_id,forklift_id,organization_id,type,status,scheduled_date,scheduled_time,completed_at)
    VALUES('${booking}','${unit}','${org}','delivery','completed','2026-09-01','10:30',now()+interval '1 year') RETURNING id,completed_at::text,created_at > completed_at AS captured_later`);
  assert.equal(
    new Date(historical.completed_at).toISOString(),
    "2026-09-01T16:30:00.000Z",
  );
  assert.equal(historical.captured_later, true);
  pass(
    "OP02 actual historic date/time honored; capture timestamp retained; browser timestamp ignored",
  );
  await sql.unsafe(
    `UPDATE deliveries SET completed_at=now(),scheduled_date=current_date WHERE id='${historical.id}'`,
  );
  const [immutable] = await sql.unsafe(
    `SELECT completed_at::text FROM deliveries WHERE id='${historical.id}'`,
  );
  assert.equal(immutable.completed_at, historical.completed_at);
  pass("OP02 completed actual time remains immutable");
  await rejected(
    "INSERT INTO deliveries(status,scheduled_date) VALUES('completed',current_date+2)",
    "23514",
    /futuras/,
  );
  pass("OP02 future actual occurrence rejected by server");
  const [dateOnly] = await sql.unsafe(
    "INSERT INTO deliveries(status,scheduled_date) VALUES('completed','2026-09-02') RETURNING (completed_at AT TIME ZONE 'America/Monterrey')::date::text AS day",
  );
  assert.equal(dateOnly.day, "2026-09-02");
  pass("OP02 date-only history remains the selected Monterrey date");
  const [live] = await sql.unsafe(
    "INSERT INTO deliveries(status,scheduled_date) VALUES('scheduled','2026-09-03') RETURNING id",
  );
  const [liveCompleted] = await sql.unsafe(
    `UPDATE deliveries SET status='completed',completed_at='2026-01-01' WHERE id='${live.id}' RETURNING abs(extract(epoch from(completed_at-now()))) < 1 AS is_now`,
  );
  assert.equal(liveCompleted.is_now, true);
  pass("OP02 normal completion still uses server now");
  // Complete an actual historical return after entering its delivery today.
  await sql.unsafe(
    `RESET ROLE; DELETE FROM deliveries WHERE id <> '${historical.id}'; SET ROLE authenticated`,
  );
  await complete(100);
  pass("OP02 historical delivery permits its genuine historical return");
  const seedVoid = async ({
    status = "repaired",
    archived = false,
    invoice = false,
    repair = null,
    foreign = false,
    withDamage = true,
  } = {}) => {
    await seed();
    await complete(100);
    await sql.unsafe("RESET ROLE");
    const [ri] = await sql.unsafe("SELECT id FROM return_inspections");
    if (repair)
      await sql.unsafe(
        `INSERT INTO maintenance_logs(id,forklift_id,organization_id,work_status) VALUES('${maintenance}','${unit}','${org}','${repair}')`,
      );
    if (withDamage)
      await sql.unsafe(`INSERT INTO damage_records(id,inspection_id,organization_id,forklift_id,booking_id,status,repaired_at,deleted_at,invoice_id,maintenance_log_id)
      VALUES('${damage}','${ri.id}','${foreign ? other : org}','${unit}','${booking}','${status}',${status === "repaired" || status === "invoiced" ? "now()" : "NULL"},${archived ? "now()" : "NULL"},${invoice ? "'80000000-0000-0000-0000-000000000001'" : "NULL"},${repair ? `'${maintenance}'` : "NULL"})`);
    await sql.unsafe("SET ROLE authenticated");
    return ri.id;
  };
  const voidQuery = (id) =>
    `SELECT public.void_return_inspection('${id}','QA mistaken return')`;
  for (const [label, options] of [
    ["no-damage control", { withDamage: false }],
    ["resolved damage", {}],
    ["archived resolved damage", { archived: true }],
    ["archived mistaken report", { status: "reported", archived: true }],
    ["closed repair history", { repair: "completed" }],
  ]) {
    const ret = await seedVoid(options);
    await sql.unsafe(voidQuery(ret));
    assert.equal(
      (await sql.unsafe("SELECT * FROM return_inspections")).length,
      0,
    );
    const [b] = await sql.unsafe("SELECT status,return_status FROM bookings");
    assert.equal(b.status, "confirmed");
    assert.equal(b.return_status, null);
    const [f] = await sql.unsafe("SELECT status FROM forklifts");
    assert.equal(f.status, "rented");
    if (options.withDamage !== false) {
      const [dr] = await sql.unsafe(
        "SELECT inspection_id,deleted_at,maintenance_log_id FROM damage_records",
      );
      assert.equal(dr.inspection_id, null);
      if (options.archived) assert.ok(dr.deleted_at);
      if (options.repair) assert.equal(dr.maintenance_log_id, maintenance);
      const [audit] = await sql.unsafe(
        "SELECT new_data FROM audit_logs WHERE table_name='damage_records'",
      );
      assert.equal(audit.new_data.voided_inspection_id, ret);
    }
    pass(
      `OP03 ${label}: reopens custody and retains audited damage/repair history`,
    );
  }
  for (const [label, options, code] of [
    ["open damage", { status: "reported" }, "P0001"],
    [
      "billed archived damage",
      { status: "invoiced", archived: true, invoice: true },
      "P0001",
    ],
    ["unfinished repair", { repair: "in_progress" }, "P0001"],
    ["foreign damage", { foreign: true }, "42501"],
  ]) {
    const ret = await seedVoid(options);
    await rejected(voidQuery(ret), code);
    assert.equal(
      (await sql.unsafe("SELECT * FROM return_inspections")).length,
      1,
    );
    const [dr] = await sql.unsafe("SELECT inspection_id FROM damage_records");
    assert.equal(dr.inspection_id, ret);
    pass(`OP03 ${label} blocks without detachment or deletion`);
  }
  const archivedId = await seedVoid({ archived: true });
  await rejected(
    `UPDATE damage_records SET description='unauthorized edit' WHERE id='${damage}'`,
    "23514",
  );
  await sql.unsafe(
    `SELECT set_config('app.return_void_inspection','${archivedId}',false)`,
  );
  await rejected(
    `UPDATE damage_records SET inspection_id=NULL WHERE id='${damage}'`,
    "23514",
  );
  await rejected(
    `UPDATE damage_records SET inspection_id=NULL,description='unauthorized edit' WHERE id='${damage}'`,
    "23514",
  );
  await sql.unsafe("SELECT set_config('app.return_void_inspection','',false)");
  await sql.unsafe(voidQuery(archivedId));
  await rejected(
    `UPDATE damage_records SET description='after annulment' WHERE id='${damage}'`,
    "23514",
  );
  assert.equal(
    (
      await sql.unsafe(
        "SELECT current_setting('app.return_void_inspection',true) AS flag",
      )
    )[0].flag,
    "",
  );
  pass(
    "OP03 archived data remains immutable before/after annulment and spoofed GUC cannot detach",
  );
  await rejected(
    `UPDATE damage_records SET deleted_at=NULL WHERE id='${damage}'`,
    "23514",
  );
  await sql.unsafe(`SELECT public.restore_damage_record('${damage}')`);
  assert.equal(
    (
      await sql.unsafe(
        `SELECT deleted_at FROM damage_records WHERE id='${damage}'`,
      )
    )[0].deleted_at,
    null,
  );
  pass("OP03 existing audited restore RPC still restores archived damage");
  const [scope] = await sql.unsafe(
    `SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='return_inspection_usage_bases' AND policyname='org_scope_isolation' AND permissive='RESTRICTIVE') AS policy, EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.return_inspection_usage_bases'::regclass AND tgname='trg_organization_write_context') AS trigger`,
  );
  assert.deepEqual(scope, { policy: true, trigger: true });
  pass(
    "OP05 internal snapshot retains standard multi-organization policy and write guard",
  );
  const ret = await seedVoid();
  await sql.unsafe("SELECT set_config('test.role','dispatcher',false)");
  await rejected(voidQuery(ret), "42501");
  pass("OP03 non-admin denied");
  await sql.unsafe(
    `SELECT set_config('test.role','admin',false),set_config('test.org','${other}',false)`,
  );
  await rejected(voidQuery(ret), "P0002");
  pass("OP03 foreign organization denied");
  const acl =
    await sql.unsafe(`SELECT has_function_privilege('anon','public.void_return_inspection(uuid,text)','EXECUTE') AS anon_void,
    has_function_privilege('authenticated','public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)','EXECUTE') AS public_basis,
    has_function_privilege('authenticated','public.recalculate_return_usage_charge()','EXECUTE') AS public_trigger`);
  assert.deepEqual(acl[0], {
    anon_void: false,
    public_basis: false,
    public_trigger: false,
  });
  pass("new helpers are not RPC entrypoints; anon cannot annul");
  console.log(
    `All ${assertions} focused PostgreSQL assertions passed. Synthetic auth/tables, exact RPCs, real FK, not full-schema/RLS validation.`,
  );
} finally {
  if (sql) await sql.end();
  if (started) run("pg_ctl", ["-D", `${dir}/data`, "-m", "immediate", "stop"]);
  console.log(`Disposable cluster stopped: ${dir}`);
}
