-- =====================================================================
-- Multi-organización · Fase 2 (integridad organización ↔ cliente)
-- Cada fila operativa que referencia un cliente debe referenciar la
-- relación de ese cliente dentro de la misma organización.
-- =====================================================================

DO $$
DECLARE
  v_organization_count integer;
  v_organization_id uuid;
  v_table text;
  v_constraint text;
  v_missing_pairs bigint;
  v_constraint_exists boolean;
  v_tables text[] := ARRAY[
    'bookings',
    'contracts',
    'credit_notes',
    'customer_payment_intents',
    'damage_records',
    'invoices',
    'prospects',
    'quotes'
  ];
BEGIN
  -- Este backfill solo es seguro durante la transición desde la instalación
  -- actual de una sola organización. Con dos organizaciones no se adivina a
  -- cuál debe pertenecer una relación cliente que todavía no exista.
  SELECT count(*) INTO v_organization_count
  FROM public.organizations;

  IF v_organization_count <> 1 THEN
    RAISE EXCEPTION
      'Se requiere exactamente una organización para completar organization_customers; hay %',
      v_organization_count;
  END IF;

  SELECT id INTO v_organization_id
  FROM public.organizations;

  -- Fase 0 ya crea estos vínculos. Esto cubre de forma idempotente datos
  -- heredados que se hayan insertado entre las fases 0 y 2.
  INSERT INTO public.organization_customers (
    organization_id, customer_id, alias, razon_social, rfc, regimen_fiscal,
    uso_cfdi, domicilio_fiscal_cp, representante_legal, contact_person,
    email, phone, billing_address, tax_rate, status, notes
  )
  SELECT
    v_organization_id, c.id, c.company, c.razon_social, c.rfc,
    c.regimen_fiscal, c.uso_cfdi, c.domicilio_fiscal_cp,
    c.representante_legal, c.contact_person, c.email, c.phone,
    COALESCE(c.billing_address, c.address), c.tax_rate,
    CASE WHEN c.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END,
    c.notes
  FROM public.customers c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_customers oc
    WHERE oc.organization_id = v_organization_id
      AND oc.customer_id = c.id
  )
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'SELECT count(*)
       FROM public.%I child
       WHERE child.organization_id IS NOT NULL
         AND child.customer_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.organization_customers oc
           WHERE oc.organization_id = child.organization_id
             AND oc.customer_id = child.customer_id
         )',
      v_table
    )
    INTO v_missing_pairs;

    IF v_missing_pairs <> 0 THEN
      RAISE EXCEPTION
        'No se puede agregar integridad organización-cliente en %: % filas no tienen una relación organization_customers compatible',
        v_table, v_missing_pairs;
    END IF;

    v_constraint := format('fk_%s_organization_customer', v_table);

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      WHERE con.conname = v_constraint
        AND con.contype = 'f'
        AND child_ns.nspname = 'public'
        AND child.relname = v_table
    )
    INTO v_constraint_exists;

    IF NOT v_constraint_exists THEN
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD CONSTRAINT %I
           FOREIGN KEY (organization_id, customer_id)
           REFERENCES public.organization_customers (organization_id, customer_id)
           ON UPDATE RESTRICT
           ON DELETE RESTRICT
           NOT VALID',
        v_table, v_constraint
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
      v_table, v_constraint
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I
       ON public.%I (organization_id, customer_id)',
      format('idx_%s_organization_customer', v_table),
      v_table
    );
  END LOOP;
END;
$$;
