-- Read-only catalog contract. Full-schema CI discovers this suite automatically.
-- Default-ACL mutation/reproduction belongs only to the disposable local harness.
\set ON_ERROR_STOP on
BEGIN;
DO $owner_only_usage$
DECLARE
  v_target record;
  v_count integer := 0;
  v_role text;
BEGIN
  FOR v_target IN
    SELECT 'table'::text AS kind, c.oid, c.relowner AS owner,
           COALESCE(c.relacl, acldefault('r', c.relowner)) AS acl
      FROM pg_class c WHERE c.oid = to_regclass('public.return_inspection_usage_bases')
    UNION ALL
    SELECT 'function', p.oid, p.proowner, COALESCE(p.proacl, acldefault('f', p.proowner))
      FROM pg_proc p WHERE p.oid IN (
        to_regprocedure('public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)'),
        to_regprocedure('public.recalculate_return_usage_charge()'))
  LOOP
    v_count := v_count + 1;
    IF pg_get_userbyid(v_target.owner) <> 'postgres'
       OR EXISTS (SELECT 1 FROM aclexplode(v_target.acl) a WHERE a.grantee <> v_target.owner)
       OR NOT EXISTS (SELECT 1 FROM aclexplode(v_target.acl) a WHERE a.grantee = v_target.owner) THEN
      RAISE EXCEPTION 'OP0115 owner-only ACL contract failed for % oid %', v_target.kind, v_target.oid;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF (v_target.kind = 'table' AND has_table_privilege(v_role, v_target.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
         OR (v_target.kind = 'function' AND has_function_privilege(v_role, v_target.oid, 'EXECUTE')) THEN
        RAISE EXCEPTION 'OP0115 private % oid % remains accessible to %', v_target.kind, v_target.oid, v_role;
      END IF;
    END LOOP;
  END LOOP;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'OP0115 requires exactly three private objects, found %', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.return_inspection_usage_bases'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.return_inspection_usage_bases'::regclass
          AND polname = 'return_usage_basis_deny_application' AND NOT polpermissive
          AND pg_get_expr(polqual, polrelid) = 'false' AND pg_get_expr(polwithcheck, polrelid) = 'false')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.return_inspection_usage_bases'::regclass
          AND confrelid = 'public.return_inspections'::regclass AND contype = 'f'
          AND confdeltype = 'c' AND condeferrable AND condeferred AND convalidated) THEN
    RAISE EXCEPTION 'OP0115 snapshot RLS, deny policy or deferred cascading FK changed';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.guard_archived_damage_immutable()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.recalculate_return_usage_charge()'::regprocedure)
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.return_usage_charge_basis(uuid,uuid,timestamptz,timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION 'OP0115 invoker/definer boundary changed';
  END IF;
END;
$owner_only_usage$;
ROLLBACK;
