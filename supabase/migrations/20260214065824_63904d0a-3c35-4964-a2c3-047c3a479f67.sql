
-- Phase 1A: Replace all permissive RLS policies with role-scoped policies
-- Roles: admin (full CRUD all), dispatcher (CRUD on business tables, read forklifts), mechanic (read most, CRUD maintenance_logs + status_logs)

-- ============ FORKLIFTS ============
DROP POLICY IF EXISTS "Authenticated access to forklifts" ON public.forklifts;

CREATE POLICY "Admins full access forklifts" ON public.forklifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read forklifts" ON public.forklifts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ BOOKINGS ============
DROP POLICY IF EXISTS "Authenticated access to bookings" ON public.bookings;

CREATE POLICY "Admins full access bookings" ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access bookings" ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ CUSTOMERS ============
DROP POLICY IF EXISTS "Authenticated access to customers" ON public.customers;

CREATE POLICY "Admins full access customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read customers" ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ INVOICES ============
DROP POLICY IF EXISTS "Authenticated access to invoices" ON public.invoices;

CREATE POLICY "Admins full access invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ QUOTES ============
DROP POLICY IF EXISTS "Authenticated access to quotes" ON public.quotes;

CREATE POLICY "Admins full access quotes" ON public.quotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access quotes" ON public.quotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read quotes" ON public.quotes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ DELIVERIES ============
DROP POLICY IF EXISTS "Authenticated access to deliveries" ON public.deliveries;

CREATE POLICY "Admins full access deliveries" ON public.deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access deliveries" ON public.deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ MAINTENANCE_LOGS ============
DROP POLICY IF EXISTS "Authenticated access to maintenance_logs" ON public.maintenance_logs;

CREATE POLICY "Admins full access maintenance_logs" ON public.maintenance_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers read maintenance_logs" ON public.maintenance_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics full access maintenance_logs" ON public.maintenance_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic')) WITH CHECK (public.has_role(auth.uid(), 'mechanic'));

-- ============ STATUS_LOGS ============
DROP POLICY IF EXISTS "Authenticated access to status_logs" ON public.status_logs;

CREATE POLICY "Admins full access status_logs" ON public.status_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers read status_logs" ON public.status_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics full access status_logs" ON public.status_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic')) WITH CHECK (public.has_role(auth.uid(), 'mechanic'));

-- ============ RETURN_INSPECTIONS ============
DROP POLICY IF EXISTS "Authenticated access to return_inspections" ON public.return_inspections;

CREATE POLICY "Admins full access return_inspections" ON public.return_inspections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access return_inspections" ON public.return_inspections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read return_inspections" ON public.return_inspections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ DAMAGE_RECORDS ============
DROP POLICY IF EXISTS "Authenticated access to damage_records" ON public.damage_records;

CREATE POLICY "Admins full access damage_records" ON public.damage_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access damage_records" ON public.damage_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read damage_records" ON public.damage_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ EQUIPMENT_MODELS ============
DROP POLICY IF EXISTS "Authenticated access to equipment_models" ON public.equipment_models;

CREATE POLICY "Admins full access equipment_models" ON public.equipment_models FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Others read equipment_models" ON public.equipment_models FOR SELECT TO authenticated
  USING (true);

-- ============ DOCUMENTS ============
DROP POLICY IF EXISTS "Authenticated access to documents" ON public.documents;

CREATE POLICY "Admins full access documents" ON public.documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers full access documents" ON public.documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'dispatcher')) WITH CHECK (public.has_role(auth.uid(), 'dispatcher'));

CREATE POLICY "Mechanics read documents" ON public.documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'mechanic'));

-- ============ ACTIVITY_FEED ============
DROP POLICY IF EXISTS "Authenticated access to activity_feed" ON public.activity_feed;

CREATE POLICY "Authenticated read activity_feed" ON public.activity_feed FOR SELECT TO authenticated
  USING (true);

-- Only admins can manually insert/update/delete activity_feed (triggers handle auto-insert)
CREATE POLICY "Admins write activity_feed" ON public.activity_feed FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update activity_feed" ON public.activity_feed FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete activity_feed" ON public.activity_feed FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
