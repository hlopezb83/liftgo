-- R12-DB-01 (P2 r10/r11): fechas de negocio con DEFAULT CURRENT_DATE (UTC del
-- servidor) → today_mty().
ALTER TABLE public.maintenance_logs ALTER COLUMN performed_at SET DEFAULT public.today_mty();
ALTER TABLE public.supplier_bills ALTER COLUMN issue_date SET DEFAULT public.today_mty();
ALTER TABLE public.credit_notes ALTER COLUMN issued_at SET DEFAULT public.today_mty();
ALTER TABLE public.operating_expenses ALTER COLUMN expense_date SET DEFAULT public.today_mty();
ALTER TABLE public.supplier_payments ALTER COLUMN payment_date SET DEFAULT public.today_mty();
ALTER TABLE public.invoices ALTER COLUMN issued_at SET DEFAULT public.today_mty();
ALTER TABLE public.payments ALTER COLUMN payment_date SET DEFAULT public.today_mty();

-- R12-DB-02 (P2 r11): la matriz rol×módulo no necesita ser pública.
DROP POLICY IF EXISTS "Authenticated users can read role_permissions" ON public.role_permissions;
CREATE POLICY "Staff read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'mechanic'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  );