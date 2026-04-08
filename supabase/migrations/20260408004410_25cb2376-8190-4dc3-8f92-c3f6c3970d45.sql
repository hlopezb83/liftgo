
-- ============================================================
-- 1. booking_extensions — replace permissive ALL true/true
-- ============================================================
DROP POLICY IF EXISTS "Staff can manage booking extensions" ON public.booking_extensions;

CREATE POLICY "Admins full access booking_extensions"
  ON public.booking_extensions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access booking_extensions"
  ON public.booking_extensions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access booking_extensions"
  ON public.booking_extensions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Auditor read booking_extensions"
  ON public.booking_extensions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Mechanics read booking_extensions"
  ON public.booking_extensions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'mechanic'::app_role));

CREATE POLICY "Ventas read booking_extensions"
  ON public.booking_extensions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ventas'::app_role));

CREATE POLICY "Customers read own booking_extensions"
  ON public.booking_extensions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'customer'::app_role)
    AND booking_id IN (
      SELECT id FROM public.bookings
      WHERE customer_id = get_customer_id_for_user(auth.uid())
    )
  );

-- ============================================================
-- 2. collection_notes — replace permissive ALL true/true
-- ============================================================
DROP POLICY IF EXISTS "Staff can manage collection notes" ON public.collection_notes;

CREATE POLICY "Admins full access collection_notes"
  ON public.collection_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access collection_notes"
  ON public.collection_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Dispatchers full access collection_notes"
  ON public.collection_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

CREATE POLICY "Auditor read collection_notes"
  ON public.collection_notes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

-- ============================================================
-- 3. forklifts — allow dispatchers to UPDATE (status changes)
-- ============================================================
CREATE POLICY "Dispatchers update forklifts"
  ON public.forklifts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'dispatcher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role));

-- ============================================================
-- 4. Functions — add SET search_path = public
-- ============================================================
ALTER FUNCTION public.next_booking_number() SET search_path = public;
ALTER FUNCTION public.next_delivery_number() SET search_path = public;
ALTER FUNCTION public.next_inspection_number() SET search_path = public;
ALTER FUNCTION public.set_delivery_number() SET search_path = public;
ALTER FUNCTION public.set_inspection_number() SET search_path = public;
ALTER FUNCTION public.set_prospect_created_by() SET search_path = public;
