-- Multi-organización Fase 2: integridad entre organización y cliente.
BEGIN;

DO $$
DECLARE
  v_table text;
  v_constraint text;
  v_has_fk boolean;
  v_has_index boolean;
  v_invalid_pairs bigint;
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
  FOREACH v_table IN ARRAY v_tables LOOP
    v_constraint := format('fk_%s_organization_customer', v_table);

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint fk
      JOIN pg_class child ON child.oid = fk.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = fk.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE fk.conname = v_constraint
        AND fk.contype = 'f'
        AND fk.convalidated
        AND fk.confupdtype = 'r'
        AND fk.confdeltype = 'r'
        AND child_ns.nspname = 'public'
        AND child.relname = v_table
        AND parent_ns.nspname = 'public'
        AND parent.relname = 'organization_customers'
        AND fk.conkey = ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = child.oid AND attname = 'organization_id'
             AND NOT attisdropped),
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = child.oid AND attname = 'customer_id'
             AND NOT attisdropped)
        ]::smallint[]
        AND fk.confkey = ARRAY[
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = parent.oid AND attname = 'organization_id'
             AND NOT attisdropped),
          (SELECT attnum FROM pg_attribute
           WHERE attrelid = parent.oid AND attname = 'customer_id'
             AND NOT attisdropped)
        ]::smallint[]
    )
    INTO v_has_fk;

    IF NOT v_has_fk THEN
      RAISE EXCEPTION
        'INTEGRIDAD: %.organization_id/customer_id debe referenciar organization_customers',
        v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_class idx
      JOIN pg_index i ON i.indexrelid = idx.oid
      JOIN pg_class child ON child.oid = i.indrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      WHERE child_ns.nspname = 'public'
        AND child.relname = v_table
        AND idx.relname = format('idx_%s_organization_customer', v_table)
        AND i.indnkeyatts = 2
        -- int2vector usa índices base 0; comparar arreglos completos conserva
        -- ese límite inferior y da un falso negativo.
        AND i.indkey[0] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = child.oid AND attname = 'organization_id'
            AND NOT attisdropped
        )
        AND i.indkey[1] = (
          SELECT attnum FROM pg_attribute
          WHERE attrelid = child.oid AND attname = 'customer_id'
            AND NOT attisdropped
        )
    )
    INTO v_has_index;

    IF NOT v_has_index THEN
      RAISE EXCEPTION
        'RENDIMIENTO: %.organization_id/customer_id debe tener índice compuesto',
        v_table;
    END IF;

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
    INTO v_invalid_pairs;

    IF v_invalid_pairs <> 0 THEN
      RAISE EXCEPTION
        'DATOS: % tiene % relaciones cliente-organización incompatibles',
        v_table, v_invalid_pairs;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
