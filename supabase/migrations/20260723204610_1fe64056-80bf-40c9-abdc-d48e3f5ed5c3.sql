-- R-arq Lote A · DIFF 1 + DIFF 4
--
-- DIFF 4: quitar SELECT directo a billing_secrets desde el cliente y mover
-- la escritura a un RPC SECURITY DEFINER con guarda admin. La lectura de
-- estado sigue via get_billing_secrets_status (RPC status-only ya existente).
--
-- DIFF 1: agendar cron para generate-recurring-invoices y
-- generate-recurring-maintenance usando internal_get_cron_secret() (patrón
-- de 20260721021751). Idempotente: hace unschedule previo por nombre.

-- ============================================================
-- DIFF 4 · billing_secrets sin SELECT directo
-- ============================================================

-- Quitar cualquier policy SELECT existente (nombres históricos).
DROP POLICY IF EXISTS "Admins select billing_secrets" ON public.billing_secrets;
DROP POLICY IF EXISTS "Admins full access billing_secrets" ON public.billing_secrets;
DROP POLICY IF EXISTS "Administrativo full access billing_secrets" ON public.billing_secrets;

-- Revocar SELECT del rol authenticated (por si un GRANT viejo lo permitía).
REVOKE SELECT ON public.billing_secrets FROM authenticated;

-- RPC para upsert con guarda admin. No devuelve valores sensibles.
CREATE OR REPLACE FUNCTION public.upsert_billing_secret(
  p_id uuid DEFAULT NULL,
  p_test_key text DEFAULT NULL,
  p_live_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo admin puede modificar billing_secrets'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.billing_secrets
       SET facturapi_test_key = COALESCE(NULLIF(p_test_key, ''), facturapi_test_key),
           facturapi_live_key = COALESCE(NULLIF(p_live_key, ''), facturapi_live_key),
           updated_at         = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'billing_secrets id % no existe', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.billing_secrets (facturapi_test_key, facturapi_live_key, updated_at)
  VALUES (NULLIF(p_test_key, ''), NULLIF(p_live_key, ''), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_billing_secret(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_billing_secret(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.upsert_billing_secret(uuid, text, text) IS
  'R-arq DIFF 4: única vía para escribir billing_secrets desde el cliente. Guard admin. No devuelve valores.';

-- ============================================================
-- DIFF 1 · Cron declarativo para generación recurrente
-- ============================================================

DO $$
DECLARE
  v_secret text;
  v_url_base constant text := 'https://zxefrzfaynnfwazqhwxp.supabase.co/functions/v1';
  v_jobs constant text[][] := ARRAY[
    ['generate-recurring-invoices-daily',    'generate-recurring-invoices',    '15 6 * * *'],
    ['generate-recurring-maintenance-daily', 'generate-recurring-maintenance', '30 6 * * *']
  ];
  v_job text[];
  v_jobid bigint;
  v_command text;
BEGIN
  SELECT public.internal_get_cron_secret() INTO v_secret;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE WARNING 'R-arq DIFF 1: CRON_SECRET no encontrado en vault; se omite reagendado.';
    RETURN;
  END IF;

  -- Unschedule previos por nombre (idempotente).
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'generate-recurring-invoices-daily',
      'generate-recurring-maintenance-daily'
    )
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  FOREACH v_job SLICE 1 IN ARRAY v_jobs LOOP
    v_command := format(
      $cmd$SELECT net.http_post(url := %L, body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public.internal_get_cron_secret()), timeout_milliseconds := 60000);$cmd$,
      v_url_base || '/' || v_job[2]
    );
    PERFORM cron.schedule(v_job[1], v_job[3], v_command);
  END LOOP;
END $$;