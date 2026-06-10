
-- Restrict supplier_bank_accounts SELECT to internal finance roles
DROP POLICY IF EXISTS supplier_bank_accounts_select_auth ON public.supplier_bank_accounts;
CREATE POLICY supplier_bank_accounts_select_staff
  ON public.supplier_bank_accounts FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

-- Restrict supplier_contacts SELECT to internal staff roles (exclude customer)
DROP POLICY IF EXISTS supplier_contacts_select_auth ON public.supplier_contacts;
CREATE POLICY supplier_contacts_select_staff
  ON public.supplier_contacts FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  );
