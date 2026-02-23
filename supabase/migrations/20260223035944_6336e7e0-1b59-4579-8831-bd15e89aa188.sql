
-- bookings: full access
CREATE POLICY "Administrativo full access bookings"
ON public.bookings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- contracts: full access
CREATE POLICY "Administrativo full access contracts"
ON public.contracts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- customers: full access
CREATE POLICY "Administrativo full access customers"
ON public.customers FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- damage_records: full access
CREATE POLICY "Administrativo full access damage_records"
ON public.damage_records FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- deliveries: full access
CREATE POLICY "Administrativo full access deliveries"
ON public.deliveries FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- documents: full access
CREATE POLICY "Administrativo full access documents"
ON public.documents FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- invoices: full access
CREATE POLICY "Administrativo full access invoices"
ON public.invoices FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- payments: full access
CREATE POLICY "Administrativo full access payments"
ON public.payments FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- quotes: full access
CREATE POLICY "Administrativo full access quotes"
ON public.quotes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- return_inspections: full access
CREATE POLICY "Administrativo full access return_inspections"
ON public.return_inspections FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- forklifts: full access
CREATE POLICY "Administrativo full access forklifts"
ON public.forklifts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role))
WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- maintenance_logs: read only
CREATE POLICY "Administrativo read maintenance_logs"
ON public.maintenance_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role));

-- status_logs: read only
CREATE POLICY "Administrativo read status_logs"
ON public.status_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role));

-- audit_logs: read only
CREATE POLICY "Administrativo read audit_logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'administrativo'::app_role));
