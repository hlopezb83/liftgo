-- =====================================================================
-- Multiempresa · Tramos 6-8: unicidad de catálogos por organización.
--
-- Diseño aprobado: docs/multiempresa/tramo-8-plan-migraciones-unicidad.md
--   · Lote 1 — catálogos operativos (flota, mecánicos, operadores,
--     refacciones, tablero de prospectos).
--   · Lote 2 — folios fiscales y de reportes (REP de pagos, folio de
--     reportes de retroalimentación).
--   · Lote 3 — proveedores, ALTERNATIVA A (proveedor propio de cada
--     empresa; customers y equipment_models siguen siendo globales).
--
-- MODO TRANSACCIONAL REAL DEL MIGRADOR (verificado antes de escribir):
--   drizzle-orm/pg-core/dialect.js envuelve TODA la corrida de migraciones
--   en `session.transaction(...)`. Por lo tanto CREATE INDEX CONCURRENTLY
--   y DROP INDEX CONCURRENTLY NO son aplicables por este carril
--   (25001: no pueden ejecutarse dentro de un bloque de transacción).
--   El plan documentado usaba CONCURRENTLY; aquí se sustituye por el
--   equivalente bloqueante, admisible por el tamaño actual de las tablas
--   (una sola organización activa, catálogos de cientos de filas):
--   cada CREATE UNIQUE INDEX toma ShareLock sobre su tabla y cada
--   DROP INDEX / ALTER TABLE toma AccessExclusiveLock durante la
--   transacción de la migración. Ventana esperada: menos de 1 s por tabla,
--   con escrituras bloqueadas mientras dura. Ver la sección "Ventana de
--   bloqueo" del documento de tramo 8.
--
-- PREFLIGHT FAIL-CLOSED: si alguna tabla objetivo tiene organization_id
-- nulo entre las filas que el índice nuevo cubriría, o duplicados dentro
-- de una misma empresa, la migración aborta ANTES de tocar índices y la
-- transacción completa se revierte.
--
-- Esta migración NO cambia cuerpos de funciones, grants, SECURITY DEFINER,
-- policies ni el formato de los folios emitidos.
-- Verificación: supabase/tests/rls/multi_org_unique_scope_ab.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Preflight (fail-closed)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_n bigint;
  v_fallas text[] := '{}';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('forklifts',       'name',                'deleted_at IS NULL'),
      ('forklifts',       'serial_number',       'serial_number IS NOT NULL AND deleted_at IS NULL'),
      ('mechanics',       'name',                'true'),
      ('drivers',         'name',                'true'),
      ('parts_inventory', 'sku',                 'sku IS NOT NULL'),
      ('prospects',       'stage, stage_order',  'true'),
      ('payments',        'rep_number',          'rep_number IS NOT NULL'),
      ('suppliers',       'upper(btrim(rfc))',   'rfc IS NOT NULL AND btrim(rfc) <> '''' AND deleted_at IS NULL')
    ) AS v(tabla, clave, filtro)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE (%s) AND organization_id IS NULL',
      r.tabla, r.filtro
    ) INTO v_n;
    IF v_n > 0 THEN
      v_fallas := v_fallas || format(
        '%s(%s): %s filas sin organization_id quedarian fuera del alcance por empresa',
        r.tabla, r.clave, v_n);
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM (SELECT 1 FROM public.%I WHERE (%s) GROUP BY organization_id, %s HAVING count(*) > 1) s',
      r.tabla, r.filtro, r.clave
    ) INTO v_n;
    IF v_n > 0 THEN
      v_fallas := v_fallas || format(
        '%s(%s): %s combinaciones duplicadas DENTRO de una misma empresa',
        r.tabla, r.clave, v_n);
    END IF;
  END LOOP;

  -- El global de feedback_reports solo puede retirarse si el par por
  -- empresa ya existe: es el que sostiene la unicidad real.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.feedback_reports'::regclass
      AND conname = 'feedback_reports_organization_folio_key'
  ) THEN
    v_fallas := v_fallas ||
      'feedback_reports: falta feedback_reports_organization_folio_key; no se retira el global';
  END IF;

  -- Coherencia fiscal: ningun pago puede pertenecer a una empresa distinta
  -- de la de su factura antes de volver el folio REP propio de cada empresa.
  SELECT count(*) INTO v_n
  FROM public.payments p
  JOIN public.invoices i ON i.id = p.invoice_id
  WHERE p.organization_id IS DISTINCT FROM i.organization_id;
  IF v_n > 0 THEN
    v_fallas := v_fallas || format(
      'payments: %s pagos con empresa distinta a la de su factura', v_n);
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'PREFLIGHT 0029: no se puede acotar la unicidad por empresa:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Lote 1 — catalogos operativos
--    Se conservan EXACTAMENTE los filtros parciales vigentes.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX forklifts_org_name_unique
  ON public.forklifts (organization_id, name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX forklifts_org_serial_number_unique
  ON public.forklifts (organization_id, serial_number)
  WHERE serial_number IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX mechanics_org_name_unique
  ON public.mechanics (organization_id, name);

CREATE UNIQUE INDEX drivers_org_name_unique
  ON public.drivers (organization_id, name);

CREATE UNIQUE INDEX parts_inventory_org_sku_unique
  ON public.parts_inventory (organization_id, sku)
  WHERE sku IS NOT NULL;

-- El tablero de prospectos reordena en lote poniendo stage_order = -1 de
-- forma transitoria, asi que la restriccion nueva conserva DEFERRABLE
-- INITIALLY IMMEDIATE, igual que la global que reemplaza.
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_org_stage_order_uniq
  UNIQUE (organization_id, stage, stage_order) DEFERRABLE INITIALLY IMMEDIATE;

DROP INDEX public.forklifts_name_unique;
DROP INDEX public.forklifts_serial_number_unique;
DROP INDEX public.mechanics_name_unique;
DROP INDEX public.drivers_name_unique;
DROP INDEX public.parts_inventory_sku_unique;
ALTER TABLE public.prospects DROP CONSTRAINT prospects_stage_order_uniq;

-- ---------------------------------------------------------------------
-- 3. Lote 2 — folios fiscales y de reportes
--
-- Auditoria del asignador REP y de todos sus callers (solo lectura, sin
-- cambios de codigo necesarios):
--   · public.assign_stamped_rep_number(uuid,text,uuid) (migracion 0026)
--     lee organization_id de la fila de public.payments, exige que el
--     caller autenticado sea miembro interno de esa misma empresa y usa
--     el parametro unicamente para RECHAZAR cruces; nunca para decidir.
--   · El wrapper de dos parametros delega con NULL, asi que tambien
--     resuelve la empresa desde la fila.
--   · supabase/functions/_shared/repFolio.ts recibe organizationId del
--     registro del pago leido en servidor; el navegador no lo propone.
--   · stamp-payment-complement resuelve la empresa con
--     resolveDocumentOrganization sobre el pago leido de la base;
--     reconcile-stamping-invoices usa payment.organization_id.
--   · Idempotencia intacta: el mismo folio sobre el mismo pago devuelve el
--     numero existente sin escribir, y el conflicto real sigue emergiendo
--     como unique_violation, ahora acotado a la empresa.
--   · El formato del folio (CP-####) no cambia.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX payments_org_rep_number_uidx
  ON public.payments (organization_id, rep_number)
  WHERE rep_number IS NOT NULL;

DROP INDEX public.payments_rep_number_uidx;

-- Redundante desde 0016: feedback_reports_organization_folio_key ya
-- garantiza la unicidad real por empresa.
ALTER TABLE public.feedback_reports DROP CONSTRAINT feedback_reports_folio_key;

-- ---------------------------------------------------------------------
-- 4. Lote 3 — proveedores (ALTERNATIVA A del documento de tramo 8)
--
-- Decision adoptada: cada empresa tiene su propio proveedor. El mismo
-- proveedor real puede existir como fila independiente en cada empresa.
-- No se crea tabla puente (alternativa B) ni se cambian consultas.
-- customers y equipment_models permanecen como catalogos globales.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX suppliers_org_rfc_unique_idx
  ON public.suppliers (organization_id, upper(btrim(rfc)))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> '' AND deleted_at IS NULL;

DROP INDEX public.suppliers_rfc_unique_idx;

-- ---------------------------------------------------------------------
-- 5. Verificacion posterior dentro de la misma transaccion
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_nombre text;
  v_fallas text[] := '{}';
BEGIN
  FOREACH v_nombre IN ARRAY ARRAY[
    'forklifts_org_name_unique',
    'forklifts_org_serial_number_unique',
    'mechanics_org_name_unique',
    'drivers_org_name_unique',
    'parts_inventory_org_sku_unique',
    'prospects_org_stage_order_uniq',
    'payments_org_rep_number_uidx',
    'suppliers_org_rfc_unique_idx'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nombre
        AND i.indisunique AND i.indisvalid AND i.indisready
    ) THEN
      v_fallas := v_fallas || (v_nombre || ' -> no existe o no quedo valido');
    END IF;
  END LOOP;

  FOREACH v_nombre IN ARRAY ARRAY[
    'forklifts_name_unique',
    'forklifts_serial_number_unique',
    'mechanics_name_unique',
    'drivers_name_unique',
    'parts_inventory_sku_unique',
    'prospects_stage_order_uniq',
    'payments_rep_number_uidx',
    'suppliers_rfc_unique_idx',
    'feedback_reports_folio_key'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_nombre
    ) THEN
      v_fallas := v_fallas || (v_nombre || ' -> el objeto global sigue presente');
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'POSTFLIGHT 0029: estado inesperado de indices:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;
