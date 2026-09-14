-- =====================================================================
-- Multi-organización · Fase 6.2 (configuración de facturación)
--
-- Aísla la configuración fiscal y las credenciales de Facturapi por
-- organización. Las RPC de administración resuelven siempre la organización
-- desde la membresía/sesión, por lo que un id de otra organización no se puede
-- actualizar.
-- =====================================================================

DO $phase6_billing_preflight$
DECLARE
  v_missing text;
  v_duplicate text;
BEGIN
  SELECT string_agg(src.table_name, ', ' ORDER BY src.table_name)
  INTO v_missing
  FROM (
    SELECT 'company_settings'::text AS table_name
    WHERE EXISTS (
      SELECT 1 FROM public.company_settings WHERE organization_id IS NULL
    )
    UNION ALL
    SELECT 'billing_secrets'
    WHERE EXISTS (
      SELECT 1 FROM public.billing_secrets WHERE organization_id IS NULL
    )
    UNION ALL
    SELECT 'invoice_number_settings'
    WHERE EXISTS (
      SELECT 1 FROM public.invoice_number_settings WHERE organization_id IS NULL
    )
  ) src;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Fase 6.2 requiere organization_id antes de endurecer configuración: %',
      v_missing;
  END IF;

  SELECT string_agg(src.table_name, ', ' ORDER BY src.table_name)
  INTO v_duplicate
  FROM (
    SELECT 'company_settings'::text AS table_name
    WHERE EXISTS (
      SELECT organization_id
      FROM public.company_settings
      GROUP BY organization_id
      HAVING count(*) > 1
    )
    UNION ALL
    SELECT 'billing_secrets'
    WHERE EXISTS (
      SELECT organization_id
      FROM public.billing_secrets
      GROUP BY organization_id
      HAVING count(*) > 1
    )
    UNION ALL
    SELECT 'invoice_number_settings'
    WHERE EXISTS (
      SELECT organization_id
      FROM public.invoice_number_settings
      GROUP BY organization_id
      HAVING count(*) > 1
    )
  ) src;

  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION
      'Fase 6.2 detectó más de una configuración por organización en: %',
      v_duplicate;
  END IF;
END;
$phase6_billing_preflight$;

ALTER TABLE public.company_settings
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.billing_secrets
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.invoice_number_settings
  ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_secrets_organization_id_key
  ON public.billing_secrets (organization_id);

-- La marca/configuración existente ya usa índices únicos parciales por
-- organization_id. Tras SET NOT NULL esos índices siguen dando exactamente
-- una fila por organización y no se reemplazan para evitar churn de nombres.
DO $phase6_billing_indexes$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'company_settings'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(organization_id)%'
  ) THEN
    RAISE EXCEPTION
      'company_settings requiere unicidad por organization_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'invoice_number_settings'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(organization_id)%'
  ) THEN
    RAISE EXCEPTION
      'invoice_number_settings requiere unicidad por organization_id';
  END IF;
END;
$phase6_billing_indexes$;

CREATE OR REPLACE FUNCTION public.get_billing_secrets_status()
RETURNS TABLE(id uuid, has_test_key boolean, has_live_key boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    bs.id,
    (bs.facturapi_test_key IS NOT NULL AND length(bs.facturapi_test_key) > 0)
      AS has_test_key,
    (bs.facturapi_live_key IS NOT NULL AND length(bs.facturapi_live_key) > 0)
      AS has_live_key
  FROM public.billing_secrets bs
  WHERE bs.organization_id = public.resolve_organization_context()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_billing_secret(
  p_id uuid DEFAULT NULL,
  p_test_key text DEFAULT NULL,
  p_live_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_organization_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo admin puede modificar billing_secrets'
      USING ERRCODE = '42501';
  END IF;

  v_organization_id := public.resolve_organization_context();

  IF p_id IS NOT NULL THEN
    UPDATE public.billing_secrets
       SET facturapi_test_key = COALESCE(
             NULLIF(p_test_key, ''),
             facturapi_test_key
           ),
           facturapi_live_key = COALESCE(
             NULLIF(p_live_key, ''),
             facturapi_live_key
           ),
           updated_at = now()
     WHERE id = p_id
       AND organization_id = v_organization_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION
        'billing_secrets id % no existe en la organización actual',
        p_id
        USING ERRCODE = 'P0002';
    END IF;

    RETURN v_id;
  END IF;

  INSERT INTO public.billing_secrets (
    organization_id,
    facturapi_test_key,
    facturapi_live_key,
    updated_at
  )
  VALUES (
    v_organization_id,
    NULLIF(p_test_key, ''),
    NULLIF(p_live_key, ''),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_secrets_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_secrets_status()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_billing_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_billing_secret(uuid, text, text)
  TO authenticated, service_role;

DO $phase6_billing_assertions$
DECLARE
  v_bad_nullable text;
  v_unscoped_functions text;
BEGIN
  SELECT string_agg(c.table_name, ', ' ORDER BY c.table_name)
  INTO v_bad_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      'company_settings',
      'billing_secrets',
      'invoice_number_settings'
    )
    AND c.column_name = 'organization_id'
    AND c.is_nullable <> 'NO';

  IF v_bad_nullable IS NOT NULL THEN
    RAISE EXCEPTION
      'organization_id debe ser NOT NULL en configuración: %',
      v_bad_nullable;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'billing_secrets'
      AND indexname = 'billing_secrets_organization_id_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(organization_id)%'
  ) THEN
    RAISE EXCEPTION
      'billing_secrets requiere índice único por organization_id';
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unscoped_functions
  FROM pg_proc p
  WHERE p.oid IN (
    'public.get_billing_secrets_status()'::regprocedure,
    'public.upsert_billing_secret(uuid, text, text)'::regprocedure
  )
    AND pg_get_functiondef(p.oid) NOT ILIKE '%resolve_organization_context%';

  IF v_unscoped_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'Las RPC de billing deben resolver la organización: %',
      v_unscoped_functions;
  END IF;
END;
$phase6_billing_assertions$;
