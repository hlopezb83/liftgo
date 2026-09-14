-- =====================================================================
-- Multi-organización · Fase 6.1 (folios y períodos fiscales)
--
-- Sustituye contadores globales de documentos por contadores serializados por
-- organización. Los folios ya emitidos se conservan: cada contador se inicia
-- por encima del máximo de su propia organización. También hace que el cierre
-- fiscal aplique sólo al período de la organización de la fila.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.organization_document_counters (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN (
    'quote',
    'contract',
    'supplier_bill',
    'invoice',
    'credit_note',
    'draft_invoice',
    'draft_credit_note',
    'booking',
    'delivery',
    'return_inspection',
    'feedback'
  )),
  next_value bigint NOT NULL CHECK (next_value >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, document_type)
);

REVOKE ALL ON TABLE public.organization_document_counters
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_document_counters
  TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_organization_context()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_active_organization_count integer;
BEGIN
  -- Para usuarios autenticados, la membresía es siempre la fuente de verdad.
  v_organization_id := public.current_organization_id();

  -- Los procesos de servicio deben declarar explícitamente el contexto; mientras
  -- existe una sola organización activa se conserva la compatibilidad temporal.
  IF v_organization_id IS NULL THEN
    v_organization_id := NULLIF(
      current_setting('app.organization_id', true),
      ''
    )::uuid;
  END IF;

  IF v_organization_id IS NULL THEN
    SELECT count(*) INTO v_active_organization_count
    FROM public.organizations
    WHERE is_active;

    IF v_active_organization_count <> 1 THEN
      RAISE EXCEPTION
        'Se requiere contexto de organización para generar o validar folios (% organizaciones activas)',
        v_active_organization_count
        USING ERRCODE = '23514';
    END IF;

    SELECT id INTO v_organization_id
    FROM public.organizations
    WHERE is_active;
  END IF;

  RETURN v_organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_organization_document_counter(
  p_document_type text,
  p_minimum bigint DEFAULT 1
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_value bigint;
BEGIN
  IF p_minimum < 1 THEN
    RAISE EXCEPTION 'El mínimo del contador debe ser positivo'
      USING ERRCODE = '22023';
  END IF;

  v_organization_id := public.resolve_organization_context();

  INSERT INTO public.organization_document_counters (
    organization_id, document_type, next_value
  )
  VALUES (v_organization_id, p_document_type, p_minimum)
  ON CONFLICT (organization_id, document_type) DO NOTHING;

  UPDATE public.organization_document_counters
     SET next_value = next_value + 1,
         updated_at = now()
   WHERE organization_id = v_organization_id
     AND document_type = p_document_type
  RETURNING next_value - 1 INTO v_value;

  IF v_value IS NULL THEN
    RAISE EXCEPTION 'No existe configuración para el contador de documento %', p_document_type
      USING ERRCODE = '23514';
  END IF;

  RETURN v_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_organization_document_counter(
  p_document_type text,
  p_minimum bigint DEFAULT 1
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_value bigint;
BEGIN
  IF p_minimum < 1 THEN
    RAISE EXCEPTION 'El mínimo del contador debe ser positivo'
      USING ERRCODE = '22023';
  END IF;

  v_organization_id := public.resolve_organization_context();

  SELECT next_value INTO v_value
  FROM public.organization_document_counters
  WHERE organization_id = v_organization_id
    AND document_type = p_document_type;

  RETURN COALESCE(v_value, p_minimum);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_organization_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_organization_document_counter(text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.peek_organization_document_counter(text, bigint)
  FROM PUBLIC, anon, authenticated;

-- Semillas por organización: nunca reciclan un folio ya existente.
WITH counter_seeds AS (
  SELECT o.id AS organization_id, 'quote'::text AS document_type,
    GREATEST(
      101::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(q.quote_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 101::bigint)
    ) AS next_value
  FROM public.organizations o
  LEFT JOIN public.quotes q
    ON q.organization_id = o.id
   AND COALESCE(q.is_e2e, false) = false
   AND q.quote_number NOT LIKE 'E2E-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'contract'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(c.contract_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.contracts c ON c.organization_id = o.id
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'supplier_bill'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(sb.bill_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.supplier_bills sb
    ON sb.organization_id = o.id
   AND sb.bill_number LIKE 'CXP-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'invoice'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(i.invoice_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint),
      COALESCE(MAX(ins.min_next_number)::bigint, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.invoices i
    ON i.organization_id = o.id
   AND COALESCE(i.is_e2e, false) = false
   AND i.invoice_number NOT LIKE 'E2E-%'
   AND i.invoice_number NOT LIKE 'BORRADOR-%'
  LEFT JOIN public.invoice_number_settings ins ON ins.organization_id = o.id
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'credit_note'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(cn.credit_note_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.credit_notes cn
    ON cn.organization_id = o.id
   AND cn.credit_note_number NOT LIKE 'BORRADOR-NC-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'draft_invoice'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(i.invoice_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.invoices i
    ON i.organization_id = o.id
   AND i.invoice_number LIKE 'BORRADOR-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'draft_credit_note'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(cn.credit_note_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.credit_notes cn
    ON cn.organization_id = o.id
   AND cn.credit_note_number LIKE 'BORRADOR-NC-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'booking'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(b.booking_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.bookings b
    ON b.organization_id = o.id
   AND COALESCE(b.is_e2e, false) = false
   AND b.booking_number NOT LIKE 'E2E-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'delivery'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(d.delivery_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.deliveries d
    ON d.organization_id = o.id
   AND d.delivery_number NOT LIKE 'E2E-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'return_inspection'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(ri.inspection_number, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.return_inspections ri
    ON ri.organization_id = o.id
   AND ri.inspection_number NOT LIKE 'E2E-%'
  GROUP BY o.id

  UNION ALL

  SELECT o.id, 'feedback'::text,
    GREATEST(
      1::bigint,
      COALESCE(MAX(NULLIF(regexp_replace(fr.folio, '[^0-9]', '', 'g'), '')::bigint) + 1, 1::bigint)
    )
  FROM public.organizations o
  LEFT JOIN public.feedback_reports fr ON fr.organization_id = o.id
  GROUP BY o.id
)
INSERT INTO public.organization_document_counters (
  organization_id, document_type, next_value
)
SELECT organization_id, document_type, next_value
FROM counter_seeds
ON CONFLICT (organization_id, document_type) DO UPDATE
SET next_value = GREATEST(
  public.organization_document_counters.next_value,
  EXCLUDED.next_value
);

DO $$
DECLARE
  v_table text;
  v_null_rows bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bookings',
    'contracts',
    'credit_notes',
    'deliveries',
    'feedback_reports',
    'fiscal_periods',
    'invoice_number_settings',
    'invoices',
    'quotes',
    'return_inspections',
    'supplier_bills'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE organization_id IS NULL',
      v_table
    )
    INTO v_null_rows;

    IF v_null_rows <> 0 THEN
      RAISE EXCEPTION
        'No se puede exigir organization_id en %: existen % filas sin organización',
        v_table, v_null_rows;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.bookings
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.contracts
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.credit_notes
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.deliveries
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.feedback_reports
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.fiscal_periods
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.invoice_number_settings
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.invoices
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.quotes
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.return_inspections
  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.supplier_bills
  ALTER COLUMN organization_id SET NOT NULL;

-- La unicidad de folios pertenece a cada organización, no a la plataforma.
DROP INDEX IF EXISTS public.contracts_contract_number_key;
DROP INDEX IF EXISTS public.contracts_contract_number_unique_idx;
ALTER TABLE public.credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_credit_note_number_key;
ALTER TABLE public.supplier_bills
  DROP CONSTRAINT IF EXISTS supplier_bills_bill_number_key;
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_number_key;
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_delivery_number_key;
ALTER TABLE public.return_inspections
  DROP CONSTRAINT IF EXISTS return_inspections_inspection_number_key;
DROP INDEX IF EXISTS public.invoices_invoice_number_unique_idx;
DROP INDEX IF EXISTS public.quotes_quote_number_unique;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_organization_contract_number_key
  UNIQUE (organization_id, contract_number);
ALTER TABLE public.credit_notes
  ADD CONSTRAINT credit_notes_organization_credit_note_number_key
  UNIQUE (organization_id, credit_note_number);
ALTER TABLE public.supplier_bills
  ADD CONSTRAINT supplier_bills_organization_bill_number_key
  UNIQUE (organization_id, bill_number);
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_organization_booking_number_key
  UNIQUE (organization_id, booking_number);
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_organization_delivery_number_key
  UNIQUE (organization_id, delivery_number);
ALTER TABLE public.return_inspections
  ADD CONSTRAINT return_inspections_organization_inspection_number_key
  UNIQUE (organization_id, inspection_number);
ALTER TABLE public.feedback_reports
  ADD CONSTRAINT feedback_reports_organization_folio_key
  UNIQUE (organization_id, folio);

CREATE UNIQUE INDEX invoices_organization_invoice_number_unique_idx
  ON public.invoices (
    organization_id,
    invoice_number,
    COALESCE(is_e2e, false)
  );
CREATE UNIQUE INDEX quotes_organization_quote_number_unique
  ON public.quotes (
    organization_id,
    quote_number,
    COALESCE(is_e2e, false)
  );

ALTER TABLE public.fiscal_periods
  DROP CONSTRAINT IF EXISTS fiscal_periods_pkey,
  ADD CONSTRAINT fiscal_periods_pkey PRIMARY KEY (organization_id, period);

CREATE OR REPLACE FUNCTION public.next_supplier_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;

  RETURN 'CXP-' || lpad(
    public.next_organization_document_counter('supplier_bill', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;

  RETURN 'CTR-' || lpad(
    public.next_organization_document_counter('contract', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere personal interno';
  END IF;

  RETURN 'COT-' || lpad(
    public.next_organization_document_counter('quote', 101)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'FAC-' || lpad(
    public.next_organization_document_counter('invoice', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.next_credit_note_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'NC-' || lpad(
    public.next_organization_document_counter('credit_note', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.next_booking_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'RSV-' || lpad(
    public.next_organization_document_counter('booking', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.next_delivery_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'ENT-' || lpad(
    public.next_organization_document_counter('delivery', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.next_inspection_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'DEV-' || lpad(
    public.next_organization_document_counter('return_inspection', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.generate_feedback_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'FB-' || lpad(
    public.next_organization_document_counter('feedback', 1)::text,
    4,
    '0'
  )
$function$;

CREATE OR REPLACE FUNCTION public.next_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN 'BORRADOR-' || lpad(
    public.next_organization_document_counter('draft_invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_invoice_number()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN 'BORRADOR-' || lpad(
    public.peek_organization_document_counter('draft_invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_draft_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN 'BORRADOR-NC-' || lpad(
    public.next_organization_document_counter('draft_credit_note', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_draft_credit_note_number()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := auth.jwt() ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS DISTINCT FROM 'service_role'
     AND NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN 'BORRADOR-NC-' || lpad(
    public.peek_organization_document_counter('draft_credit_note', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN 'FAC-' || lpad(
    public.peek_organization_document_counter('invoice', 1)::text,
    4,
    '0'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_fiscal_period_open(
  _date date,
  _table_name text,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF _date IS NULL THEN
    RETURN;
  END IF;

  v_organization_id := COALESCE(
    p_organization_id,
    public.resolve_organization_context()
  );

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.organization_id = v_organization_id
      AND fp.period = to_char(_date, 'YYYY-MM')
      AND fp.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'El periodo fiscal % está cerrado; no se pueden registrar fechas en % dentro de ese periodo.',
      to_char(_date, 'YYYY-MM'), _table_name
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_guard_invoice_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_fiscal_period_open(
    NEW.issued_at,
    'invoices.issued_at',
    NEW.organization_id
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_guard_payment_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_fiscal_period_open(
    NEW.payment_date,
    'payments.payment_date',
    NEW.organization_id
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_fiscal_period_open(date, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_fiscal_period_open(date, text, uuid)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.guard_fiscal_period_open(date, text);

DO $$
DECLARE
  v_sequence_bound_functions text;
  v_bad_unique_indexes text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_sequence_bound_functions
  FROM pg_proc p
  WHERE p.oid IN (
    'public.next_supplier_bill_number()'::regprocedure,
    'public.next_contract_number()'::regprocedure,
    'public.next_quote_number()'::regprocedure,
    'public.next_invoice_number()'::regprocedure,
    'public.next_credit_note_number()'::regprocedure,
    'public.next_draft_invoice_number()'::regprocedure,
    'public.peek_next_draft_invoice_number()'::regprocedure,
    'public.next_draft_credit_note_number()'::regprocedure,
    'public.peek_next_draft_credit_note_number()'::regprocedure,
    'public.peek_next_invoice_number()'::regprocedure,
    'public.next_booking_number()'::regprocedure,
    'public.next_delivery_number()'::regprocedure,
    'public.next_inspection_number()'::regprocedure,
    'public.generate_feedback_number()'::regprocedure
  )
    AND pg_get_functiondef(p.oid) ~ 'public\.[a-z_]+_seq';

  IF v_sequence_bound_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'Estos generadores siguen ligados a secuencias globales: %',
      v_sequence_bound_functions;
  END IF;

  SELECT string_agg(indexname, ', ' ORDER BY indexname)
  INTO v_bad_unique_indexes
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'contracts_contract_number_key',
      'contracts_contract_number_unique_idx',
      'credit_notes_credit_note_number_key',
      'supplier_bills_bill_number_key',
      'bookings_booking_number_key',
      'deliveries_delivery_number_key',
      'return_inspections_inspection_number_key',
      'invoices_invoice_number_unique_idx',
      'quotes_quote_number_unique'
    );

  IF v_bad_unique_indexes IS NOT NULL THEN
    RAISE EXCEPTION
      'Persisten índices globales de folio: %',
      v_bad_unique_indexes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.fiscal_periods'::regclass
      AND c.contype = 'p'
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (organization_id, period)'
  ) THEN
    RAISE EXCEPTION
      'fiscal_periods debe tener PK compuesta por organización y período';
  END IF;
END;
$$;
