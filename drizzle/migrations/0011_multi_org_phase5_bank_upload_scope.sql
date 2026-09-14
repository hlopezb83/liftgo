-- =====================================================================
-- Multi-organización · Fase 5.2c (cargas bancarias privilegiadas)
--
-- Las tablas de staging no están expuestas a authenticated. Estas RPC
-- mantienen SECURITY DEFINER, pero resuelven y validan la organización antes
-- de cada operación de carga.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.begin_bank_statement_upload(p_upload_id uuid, p_bank_account_id uuid, p_file_name text, p_period_start date, p_period_end date, p_expected_count integer)
 RETURNS TABLE(upload_id uuid, upload_state text, staged_count integer, result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_file_name text := coalesce(nullif(btrim(p_file_name), ''), 'estado-de-cuenta');
  v_organization_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_upload_id IS NULL OR p_bank_account_id IS NULL
     OR p_expected_count IS NULL OR p_expected_count NOT BETWEEN 1 AND 50000
     OR (p_period_start IS NOT NULL AND p_period_end IS NOT NULL AND p_period_start > p_period_end) THEN
    RAISE EXCEPTION 'Metadatos de carga invalidos.' USING ERRCODE = '22023';
  END IF;

  SELECT ba.organization_id INTO v_organization_id
  FROM public.bank_accounts ba
  WHERE ba.id = p_bank_account_id
    AND public.organization_scope_matches(ba.organization_id);

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta bancaria inexistente o no autorizada.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.bank_statement_uploads (
    id, created_by, bank_account_id, file_name, period_start, period_end,
    expected_count, organization_id
  ) VALUES (
    p_upload_id, v_uid, p_bank_account_id, v_file_name, p_period_start,
    p_period_end, p_expected_count, v_organization_id
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND public.organization_scope_matches(u.organization_id)
  FOR UPDATE;

  IF v_upload.id IS NULL OR v_upload.created_by <> v_uid THEN
    RAISE EXCEPTION 'Carga inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;

  IF v_upload.bank_account_id <> p_bank_account_id
     OR v_upload.file_name <> v_file_name
     OR v_upload.period_start IS DISTINCT FROM p_period_start
     OR v_upload.period_end IS DISTINCT FROM p_period_end
     OR v_upload.expected_count <> p_expected_count THEN
    RAISE EXCEPTION 'El identificador de carga ya pertenece a otro archivo.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT v_upload.id, v_upload.state, v_upload.staged_count, v_upload.result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_bank_statement_chunk(p_upload_id uuid, p_chunk_index integer, p_lines jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_upload public.bank_statement_uploads%ROWTYPE;
  v_line_count integer;
  v_expected_line_count integer;
  v_chunk_hash text;
  v_existing_hash text;
  v_staged_count integer;
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_upload
  FROM public.bank_statement_uploads u
  WHERE u.id = p_upload_id
    AND public.organization_scope_matches(u.organization_id)
  FOR UPDATE;

  IF v_upload.id IS NULL OR v_upload.created_by <> v_uid THEN
    RAISE EXCEPTION 'Carga inexistente o no autorizada.' USING ERRCODE = '42501';
  END IF;
  IF v_upload.state <> 'staging' THEN
    RAISE EXCEPTION 'La carga ya fue finalizada.' USING ERRCODE = '55000';
  END IF;
  IF p_chunk_index IS NULL OR p_chunk_index < 0
     OR p_chunk_index >= ((v_upload.expected_count + 499) / 500) THEN
    RAISE EXCEPTION 'Indice de bloque invalido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'El bloque debe ser un arreglo JSON.' USING ERRCODE = '22023';
  END IF;

  v_line_count := jsonb_array_length(p_lines);
  v_expected_line_count := least(500, v_upload.expected_count - (p_chunk_index * 500));
  IF v_line_count <> v_expected_line_count THEN
    RAISE EXCEPTION 'El bloque % contiene % lineas; se esperaban %.',
      p_chunk_index, v_line_count, v_expected_line_count USING ERRCODE = '22023';
  END IF;

  v_chunk_hash := encode(extensions.digest(p_lines::text, 'sha256'), 'hex');

  INSERT INTO public.bank_statement_upload_chunks (
    upload_id, chunk_index, line_count, chunk_hash, lines, organization_id
  ) VALUES (
    p_upload_id, p_chunk_index, v_line_count, v_chunk_hash, p_lines,
    v_upload.organization_id
  )
  ON CONFLICT (upload_id, chunk_index) DO NOTHING;

  SELECT c.chunk_hash INTO v_existing_hash
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id AND c.chunk_index = p_chunk_index;

  IF v_existing_hash IS DISTINCT FROM v_chunk_hash THEN
    RAISE EXCEPTION 'El bloque % ya existe con contenido distinto.', p_chunk_index
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(c.line_count), 0)::integer INTO v_staged_count
  FROM public.bank_statement_upload_chunks c
  WHERE c.upload_id = p_upload_id;

  IF v_staged_count > v_upload.expected_count THEN
    RAISE EXCEPTION 'La carga excede el conteo declarado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bank_statement_uploads
  SET staged_count = v_staged_count, updated_at = now()
  WHERE id = p_upload_id;

  RETURN v_staged_count;
END;
$function$;

DO $$
DECLARE
  v_unscoped text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unscoped
  FROM pg_proc p
  WHERE p.oid IN (
    'public.begin_bank_statement_upload(uuid,uuid,text,date,date,integer)'::regprocedure,
    'public.stage_bank_statement_chunk(uuid,integer,jsonb)'::regprocedure
  )
    AND position('organization_scope_matches' IN pg_get_functiondef(p.oid)) = 0;

  IF v_unscoped IS NOT NULL THEN
    RAISE EXCEPTION
      'Las cargas bancarias privilegiadas no validan organización: %',
      v_unscoped;
  END IF;
END;
$$;
