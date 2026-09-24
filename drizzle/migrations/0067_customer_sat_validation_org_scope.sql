-- La validación fiscal depende de la ficha y llave PAC de cada empresa.
-- Los resultados globales sólo se heredan cuando el cliente ha tenido una
-- única relación; los clientes compartidos empiezan sin validar.
ALTER TABLE public.organization_customers
  ADD COLUMN IF NOT EXISTS sat_validation_status text NOT NULL DEFAULT 'not_validated',
  ADD COLUMN IF NOT EXISTS sat_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sat_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_customers_sat_status_chk'
      AND conrelid = 'public.organization_customers'::regclass
  ) THEN
    ALTER TABLE public.organization_customers
      ADD CONSTRAINT organization_customers_sat_status_chk
      CHECK (sat_validation_status IN ('not_validated', 'valid', 'mismatch', 'error'));
  END IF;
END $$;

UPDATE public.organization_customers oc
SET sat_validation_status = c.sat_validation_status,
    sat_validated_at = c.sat_validated_at,
    sat_validation_errors = COALESCE(c.sat_validation_errors, '[]'::jsonb)
FROM public.customers c
WHERE c.id = oc.customer_id
  AND c.sat_validation_status <> 'not_validated'
  AND (SELECT count(*) FROM public.organization_customers links
       WHERE links.customer_id = c.id) = 1;

-- El navegador puede editar la relación comercial, pero sólo el proceso
-- servidor que consulta al PAC puede acreditar un resultado de validación.
CREATE OR REPLACE FUNCTION public.guard_organization_customer_sat_validation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user NOT IN ('service_role', 'postgres') AND (
      NEW.sat_validation_status IS DISTINCT FROM 'not_validated' OR
      NEW.sat_validated_at IS NOT NULL OR
      NEW.sat_validation_errors IS DISTINCT FROM '[]'::jsonb
    ) THEN
      RAISE EXCEPTION 'SAT validation results are server-managed'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF current_user NOT IN ('service_role', 'postgres') AND (
      NEW.sat_validation_status IS DISTINCT FROM OLD.sat_validation_status OR
      NEW.sat_validated_at IS DISTINCT FROM OLD.sat_validated_at OR
      NEW.sat_validation_errors IS DISTINCT FROM OLD.sat_validation_errors
    ) THEN
      RAISE EXCEPTION 'SAT validation results are server-managed'
        USING ERRCODE = '42501';
    END IF;
    -- Una ficha fiscal editada invalida el resultado anterior de esta empresa.
    IF NEW.rfc IS DISTINCT FROM OLD.rfc OR
       NEW.razon_social IS DISTINCT FROM OLD.razon_social OR
       NEW.alias IS DISTINCT FROM OLD.alias OR
       NEW.regimen_fiscal IS DISTINCT FROM OLD.regimen_fiscal OR
       NEW.domicilio_fiscal_cp IS DISTINCT FROM OLD.domicilio_fiscal_cp THEN
      NEW.sat_validation_status := 'not_validated';
      NEW.sat_validated_at := NULL;
      NEW.sat_validation_errors := '[]'::jsonb;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_organization_customer_sat_validation
  ON public.organization_customers;
CREATE TRIGGER trg_guard_organization_customer_sat_validation
BEFORE INSERT OR UPDATE ON public.organization_customers
FOR EACH ROW EXECUTE FUNCTION public.guard_organization_customer_sat_validation();
