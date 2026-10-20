-- role_permissions is global, not owned by a tenant. Its old audit trigger
-- wrote to tenant audit_logs and failed when a system migration had no single
-- organization. Keep tenant auditing untouched and record these changes in a
-- separate owner-only global journal. No actor or organization is fabricated.
-- Idempotent so deployment may prepare this prerequisite before 0111/0112 in
-- ONE transaction, then register 0111, 0112 and 0113 only after all succeed.

-- Refuse to adopt an unrelated relation or permissive pre-existing policy.
-- A normal reapply sees exactly the owner-only journal created below.
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.role_permissions'::regclass
      AND t.tgname = 'audit_role_permissions' AND t.tgenabled = 'O'
      AND t.tgtype = 29 AND t.tgnargs = 0 AND t.tgqual IS NULL
      AND n.nspname = 'public'
      AND p.proname IN ('audit_trigger_fn', 'audit_global_role_permission_change')
  ) THEN
    RAISE EXCEPTION 'Unexpected existing role_permissions audit trigger';
  END IF;
  IF to_regclass('public.role_permission_audit_events') IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid = 'public.role_permission_audit_events'::regclass) <> 'r'
       OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.role_permission_audit_events'::regclass
         AND NOT (polname = 'global_permission_audit_deny_application' AND NOT polpermissive
           AND polcmd = '*' AND polroles = ARRAY[0::oid]
           AND pg_get_expr(polqual, polrelid) = 'false' AND pg_get_expr(polwithcheck, polrelid) = 'false'))
       OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.role_permission_audit_events'::regclass AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'Unexpected global permission audit relation, policies or triggers';
    END IF;
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.role_permission_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[] NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'system')),
  database_session_user text NOT NULL,
  CONSTRAINT role_permission_audit_actor_consistent CHECK (
    (actor_kind = 'system' AND actor_user_id IS NULL)
    OR (actor_kind = 'user' AND actor_user_id IS NOT NULL)
  )
);

ALTER TABLE public.role_permission_audit_events ENABLE ROW LEVEL SECURITY;
-- Explicit revocation also neutralizes project-wide default table grants.
-- A restrictive deny-all policy and no new reader role: global data must not leak
-- through a tenant-admin/auditor session or the existing audit-log UI.
REVOKE ALL ON TABLE public.role_permission_audit_events FROM PUBLIC, anon, authenticated, service_role;
-- Satisfy the explicit-grant schema convention without creating a reader:
-- only re-grant SELECT to the existing owner, who already has all privileges.
DO $owner_policy$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class
    WHERE oid = 'public.role_permission_audit_events'::regclass;
  EXECUTE format('GRANT SELECT ON public.role_permission_audit_events TO %I', v_owner);
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.role_permission_audit_events'::regclass) THEN
    CREATE POLICY global_permission_audit_deny_application
      ON public.role_permission_audit_events AS RESTRICTIVE
      FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  END IF;
END;
$owner_policy$;


CREATE OR REPLACE FUNCTION public.audit_global_role_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_field text;
  v_actor uuid := auth.uid();
BEGIN
  -- Do not let reuse on a tenant table silently redirect its audit trail.
  IF TG_RELID <> 'public.role_permissions'::regclass
     OR TG_NAME <> 'audit_role_permissions' THEN
    RAISE EXCEPTION 'Global permission audit attached to unexpected target'
      USING ERRCODE = '42501';
  END IF;

  -- Whitelist the permission fields. Never copy unrelated future columns,
  -- credentials, request headers, or payloads into this global journal.
  IF TG_OP <> 'INSERT' THEN
    v_old := jsonb_build_object('id', OLD.id, 'role', OLD.role,
      'module', OLD.module, 'access_level', OLD.access_level);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new := jsonb_build_object('id', NEW.id, 'role', NEW.role,
      'module', NEW.module, 'access_level', NEW.access_level);
  END IF;

  v_changed := ARRAY[]::text[];
  FOREACH v_field IN ARRAY ARRAY['id', 'role', 'module', 'access_level'] LOOP
    IF (v_old -> v_field) IS DISTINCT FROM (v_new -> v_field) THEN
      v_changed := array_append(v_changed, v_field);
    END IF;
  END LOOP;
  -- Preserve the existing behavior for no-op/timestamp-only UPDATEs.
  IF TG_OP = 'UPDATE' AND cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.role_permission_audit_events
    (record_id, action, old_data, new_data, changed_fields,
     actor_user_id, actor_kind, database_session_user)
  VALUES
    (COALESCE(NEW.id, OLD.id), TG_OP, v_old, v_new, v_changed,
     v_actor, CASE WHEN v_actor IS NULL THEN 'system' ELSE 'user' END,
     session_user);
  -- No app.audit_source/app.e2e_seed override: system work has no auth actor,
  -- and E2E security changes remain auditable rather than being skipped.
  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_global_role_permission_change() FROM PUBLIC, anon, authenticated, service_role;

-- CREATE OR REPLACE is atomic: there is never an unaudited DML window.
-- It preserves the established trigger name and all three audited operations.
CREATE OR REPLACE TRIGGER audit_role_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_global_role_permission_change();

COMMENT ON TABLE public.role_permission_audit_events IS
  'Owner-only global permission journal. No tenant attribution; never expose through tenant audit views.';
COMMENT ON FUNCTION public.audit_global_role_permission_change() IS
  'Dedicated global role_permissions audit. Auth actor or truthful system/session_user; no caller-controlled audit-source override.';

-- Fail closed on IF NOT EXISTS drift; do not silently register a different
-- journal contract or leave inherited grants/policies attached to it.
DO $postconditions$
DECLARE
  v_columns text[];
BEGIN
  SELECT array_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text ORDER BY a.attnum)
    INTO v_columns FROM pg_attribute a
    WHERE a.attrelid = 'public.role_permission_audit_events'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_columns IS DISTINCT FROM ARRAY[
    'id:uuid:true', 'recorded_at:timestamp with time zone:true',
    'transaction_id:bigint:true', 'record_id:uuid:true', 'action:text:true',
    'old_data:jsonb:false', 'new_data:jsonb:false', 'changed_fields:text[]:true',
    'actor_user_id:uuid:false', 'actor_kind:text:true', 'database_session_user:text:true'
  ] THEN
    RAISE EXCEPTION 'Global permission audit column contract drift';
  END IF;
  IF (SELECT relowner FROM pg_class WHERE oid = 'public.role_permission_audit_events'::regclass)
       IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid = 'public.role_permissions'::regclass) THEN
    RAISE EXCEPTION 'Global permission audit owner contract drift';
  END IF;
  IF (SELECT array_agg(a.attname || ':' || pg_get_expr(d.adbin, d.adrelid) ORDER BY a.attnum)
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE d.adrelid='public.role_permission_audit_events'::regclass)
      IS DISTINCT FROM ARRAY['id:gen_random_uuid()', 'recorded_at:clock_timestamp()', 'transaction_id:txid_current()'] THEN
    RAISE EXCEPTION 'Global permission audit default contract drift';
  END IF;
  IF (SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid))
      FROM pg_constraint WHERE conrelid='public.role_permission_audit_events'::regclass)
      IS DISTINCT FROM ARRAY[
        $c$CHECK ((((actor_kind = 'system'::text) AND (actor_user_id IS NULL)) OR ((actor_kind = 'user'::text) AND (actor_user_id IS NOT NULL))))$c$,
        $c$CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))$c$,
        $c$CHECK ((actor_kind = ANY (ARRAY['user'::text, 'system'::text])))$c$,
        'PRIMARY KEY (id)'
      ] OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.role_permission_audit_events'::regclass
                     AND (NOT convalidated OR condeferrable)) THEN
    RAISE EXCEPTION 'Global permission audit constraint contract drift';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.role_permission_audit_events'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.role_permission_audit_events'::regclass
         AND NOT (polname = 'global_permission_audit_deny_application' AND NOT polpermissive
           AND polcmd = '*' AND polroles = ARRAY[0::oid]
           AND pg_get_expr(polqual, polrelid) = 'false' AND pg_get_expr(polwithcheck, polrelid) = 'false'))
     OR EXISTS (
       SELECT 1 FROM pg_class c,
         LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
       WHERE c.oid = 'public.role_permission_audit_events'::regclass AND a.grantee <> c.relowner
     ) THEN
    RAISE EXCEPTION 'Global permission audit must remain owner-only with RLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.audit_global_role_permission_change()'::regprocedure
      AND a.grantee <> p.proowner
  ) OR (SELECT proowner FROM pg_proc WHERE oid = 'public.audit_global_role_permission_change()'::regprocedure)
       IS DISTINCT FROM (SELECT relowner FROM pg_class WHERE oid = 'public.role_permission_audit_events'::regclass) THEN
    RAISE EXCEPTION 'Global audit function must share table owner and have owner-only EXECUTE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.role_permissions'::regclass
      AND tgname = 'audit_role_permissions' AND tgenabled = 'O'
      AND tgtype = 29 -- AFTER ROW INSERT/DELETE/UPDATE
      AND tgfoid = 'public.audit_global_role_permission_change()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Global permission audit trigger contract drift';
  END IF;
END;
$postconditions$;
