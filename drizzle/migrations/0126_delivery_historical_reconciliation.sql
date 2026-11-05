-- Administrative classification, never a logistics completion. No delivery,
-- booking, forklift or invoice is updated. Existing permissions are preserved.
CREATE TABLE public.delivery_historical_reconciliations (
  delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  classification text NOT NULL CHECK (classification IN ('closed_rental', 'equipment_sale')),
  reference_date date NOT NULL,
  date_basis text NOT NULL CHECK (date_basis IN ('booking_start_authorized', 'sale_invoice_issued_authorized')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 4000),
  authorization_source text NOT NULL CHECK (length(btrim(authorization_source)) BETWEEN 10 AND 4000),
  reconciled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revocation_reason text,
  CHECK ((classification = 'closed_rental' AND date_basis = 'booking_start_authorized') OR
         (classification = 'equipment_sale' AND date_basis = 'sale_invoice_issued_authorized')),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR
         (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND length(btrim(revocation_reason)) >= 10))
);
ALTER TABLE public.delivery_historical_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_historical_reconciliations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.delivery_historical_reconciliations TO authenticated;
CREATE POLICY org_scope_isolation ON public.delivery_historical_reconciliations AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.organization_scope_matches(organization_id));
-- The EXISTS runs as the reader and therefore inherits deliveries' RLS, not an
-- independent role list. The ledger contains no amounts, customers or CFDI data.
CREATE POLICY visible_delivery ON public.delivery_historical_reconciliations
  FOR SELECT TO authenticated USING (
    organization_id = public.current_internal_organization_id()
    AND public.is_internal_member(auth.uid())
    AND EXISTS (SELECT 1 FROM public.deliveries d
                WHERE d.id = delivery_id AND d.organization_id = delivery_historical_reconciliations.organization_id)
  );
CREATE FUNCTION public.guard_delivery_historical_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Conserva la conciliación histórica; registra su revocación.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'revoked_at' - 'revocation_reason') IS DISTINCT FROM
       (to_jsonb(OLD) - 'revoked_at' - 'revocation_reason')
       OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'Solo se permite revocar una conciliación activa, conservando su historial.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id = NEW.delivery_id
                 AND d.organization_id = NEW.organization_id AND d.type = 'delivery' AND d.status = 'scheduled') THEN
    RAISE EXCEPTION 'La conciliación requiere una entrega histórica programada de la misma organización.' USING ERRCODE = '23514';
  END IF;
  IF NEW.reference_date > public.today_mty() THEN
    RAISE EXCEPTION 'La fecha histórica no puede ser futura.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_delivery_historical_reconciliation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_delivery_historical_reconciliation BEFORE INSERT OR UPDATE OR DELETE
  ON public.delivery_historical_reconciliations FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_historical_reconciliation();
CREATE FUNCTION public.audit_delivery_historical_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, source, organization_id)
  VALUES ('delivery_historical_reconciliations', NEW.delivery_id, TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END, NEW.organization_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_delivery_historical_reconciliation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER audit_delivery_historical_reconciliation AFTER INSERT OR UPDATE
  ON public.delivery_historical_reconciliations FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_historical_reconciliation();
COMMENT ON TABLE public.delivery_historical_reconciliations IS
  'Owner-managed, audited historical classification. Reference dates are authorized reference dates, not fabricated signatures or timestamps. No client writes.';

-- Fail closed if deployment-specific default privileges would broaden access.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid='public.delivery_historical_reconciliations'::regclass
      AND a.grantee<>c.relowner
      AND NOT (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')
               AND a.privilege_type='SELECT' AND NOT a.is_grantable)) THEN
    RAISE EXCEPTION 'Unexpected default privileges on historical reconciliation ledger';
  END IF;
END $$;
