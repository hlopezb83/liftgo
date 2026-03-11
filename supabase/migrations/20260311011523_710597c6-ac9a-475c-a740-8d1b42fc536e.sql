
-- RLS: ventas full access on customers
CREATE POLICY "Ventas full access customers" ON public.customers FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role))
WITH CHECK (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas full access on prospects
CREATE POLICY "Ventas full access prospects" ON public.prospects FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role))
WITH CHECK (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas full access on quotes
CREATE POLICY "Ventas full access quotes" ON public.quotes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role))
WITH CHECK (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas full access on quote_assigned_forklifts
CREATE POLICY "Ventas full access quote_assigned_forklifts" ON public.quote_assigned_forklifts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role))
WITH CHECK (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read forklifts
CREATE POLICY "Ventas read forklifts" ON public.forklifts FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read equipment_models
CREATE POLICY "Ventas read equipment_models" ON public.equipment_models FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read bookings
CREATE POLICY "Ventas read bookings" ON public.bookings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read activity_feed
CREATE POLICY "Ventas read activity_feed" ON public.activity_feed FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read audit_logs
CREATE POLICY "Ventas read audit_logs" ON public.audit_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read profiles
CREATE POLICY "Ventas read profiles" ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));

-- RLS: ventas read documents
CREATE POLICY "Ventas read documents" ON public.documents FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ventas'::app_role));
