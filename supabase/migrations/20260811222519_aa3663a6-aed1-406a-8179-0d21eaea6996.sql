-- =====================================================================
-- Endurecimiento de policies TO PUBLIC -> TO authenticated
-- Reglas permanentes aplicadas:
--   * Prohibido FOR ALL ... USING (true)  -> no se introduce ninguna
--   * (select auth.uid()) siempre         -> vía helpers STABLE
--   * SECURITY DEFINER + SET search_path  -> en los 3 helpers nuevos
--   * Sin exposición a anon               -> TO authenticated explícito
-- Semántica preservada: mismas combinaciones rol/comando que hoy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers STABLE para consolidar cadenas OR de has_role()
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_maintenance_reader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'auditor', 'mechanic']::public.app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.is_inventory_reader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'auditor', 'dispatcher', 'mechanic']::public.app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.is_parts_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (select auth.uid())
      AND ur.role = ANY (ARRAY['admin', 'administrativo', 'mechanic']::public.app_role[])
  )
$$;

REVOKE ALL ON FUNCTION public.is_maintenance_reader() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_inventory_reader() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_parts_writer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_maintenance_reader() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_inventory_reader() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_parts_writer() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- audit_logs: 3 SELECT por rol -> 1 consolidada (la de ventas es
-- condicional por table_name y se mantiene aparte).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Administrativo read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Auditor read audit_logs" ON public.audit_logs;

CREATE POLICY "Staff read audit_logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING ((select public.is_admin_administrativo_auditor()));

-- ---------------------------------------------------------------------
-- collection_reminders_log: 2 SELECT -> 1 consolidada.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins view collection reminders" ON public.collection_reminders_log;
DROP POLICY IF EXISTS "Auditors view collection reminders" ON public.collection_reminders_log;

CREATE POLICY "Staff view collection reminders"
  ON public.collection_reminders_log FOR SELECT TO authenticated
  USING ((select public.is_admin_administrativo_auditor()));

-- ---------------------------------------------------------------------
-- contract_templates: la SELECT (is_backoffice, TO authenticated) ya
-- existe y no se toca. El FOR ALL de administrativo se descompone en
-- escrituras explícitas; admin y administrativo comparten helper.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Administrativo full access contract_templates" ON public.contract_templates;
DROP POLICY IF EXISTS "Admins write contract_templates" ON public.contract_templates;
DROP POLICY IF EXISTS "Admins update contract_templates" ON public.contract_templates;
DROP POLICY IF EXISTS "Admins delete contract_templates" ON public.contract_templates;

CREATE POLICY "Admin/administrativo insert contract_templates"
  ON public.contract_templates FOR INSERT TO authenticated
  WITH CHECK ((select public.is_admin_or_administrativo()));

CREATE POLICY "Admin/administrativo update contract_templates"
  ON public.contract_templates FOR UPDATE TO authenticated
  USING ((select public.is_admin_or_administrativo()))
  WITH CHECK ((select public.is_admin_or_administrativo()));

CREATE POLICY "Admin/administrativo delete contract_templates"
  ON public.contract_templates FOR DELETE TO authenticated
  USING ((select public.is_admin_or_administrativo()));

-- ---------------------------------------------------------------------
-- maintenance_parts: 12 policies por rol -> 4 por comando.
-- Lectura: admin, administrativo, auditor, mechanic.
-- Escritura: admin, administrativo, mechanic.
-- La policy "Matrix read maintenance_parts" (has_permission) se conserva.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Administrativo read maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Auditor read maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Mechanic read maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Admin write maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Administrativo write maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Mechanic write maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Admin update maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Administrativo update maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Mechanic update maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Admin delete maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Administrativo delete maintenance_parts" ON public.maintenance_parts;
DROP POLICY IF EXISTS "Mechanic delete maintenance_parts" ON public.maintenance_parts;

CREATE POLICY "Maintenance staff read maintenance_parts"
  ON public.maintenance_parts FOR SELECT TO authenticated
  USING ((select public.is_maintenance_reader()));

CREATE POLICY "Parts writers insert maintenance_parts"
  ON public.maintenance_parts FOR INSERT TO authenticated
  WITH CHECK ((select public.is_parts_writer()));

CREATE POLICY "Parts writers update maintenance_parts"
  ON public.maintenance_parts FOR UPDATE TO authenticated
  USING ((select public.is_parts_writer()))
  WITH CHECK ((select public.is_parts_writer()));

CREATE POLICY "Parts writers delete maintenance_parts"
  ON public.maintenance_parts FOR DELETE TO authenticated
  USING ((select public.is_parts_writer()));

-- ---------------------------------------------------------------------
-- parts_inventory: 14 policies por rol -> 4 por comando.
-- Lectura: admin, administrativo, auditor, dispatcher, mechanic.
-- Escritura: admin, administrativo, mechanic.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Administrativo read parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Auditor read parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Dispatcher read parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Mechanic read parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Admin write parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Administrativo write parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Mechanic write parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Admin update parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Administrativo update parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Mechanic update parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Admin delete parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Administrativo delete parts_inventory" ON public.parts_inventory;
DROP POLICY IF EXISTS "Mechanic delete parts_inventory" ON public.parts_inventory;

CREATE POLICY "Inventory readers read parts_inventory"
  ON public.parts_inventory FOR SELECT TO authenticated
  USING ((select public.is_inventory_reader()));

CREATE POLICY "Parts writers insert parts_inventory"
  ON public.parts_inventory FOR INSERT TO authenticated
  WITH CHECK ((select public.is_parts_writer()));

CREATE POLICY "Parts writers update parts_inventory"
  ON public.parts_inventory FOR UPDATE TO authenticated
  USING ((select public.is_parts_writer()))
  WITH CHECK ((select public.is_parts_writer()));

CREATE POLICY "Parts writers delete parts_inventory"
  ON public.parts_inventory FOR DELETE TO authenticated
  USING ((select public.is_parts_writer()));

-- ---------------------------------------------------------------------
-- Lotes de pago a proveedores: FOR ALL TO PUBLIC -> TO authenticated.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin/Administrativo manage payment batches" ON public.supplier_payment_batches;
CREATE POLICY "Admin/Administrativo manage payment batches"
  ON public.supplier_payment_batches FOR ALL TO authenticated
  USING ((select public.is_admin_or_administrativo()))
  WITH CHECK ((select public.is_admin_or_administrativo()));

DROP POLICY IF EXISTS "Admin/Administrativo manage payment batch items" ON public.supplier_payment_batch_items;
CREATE POLICY "Admin/Administrativo manage payment batch items"
  ON public.supplier_payment_batch_items FOR ALL TO authenticated
  USING ((select public.is_admin_or_administrativo()))
  WITH CHECK ((select public.is_admin_or_administrativo()));
