-- =====================================================================
-- Multiempresa · Tramo 8.1: endurecimiento del asignador de folio REP.
--
-- REVISABLE, NO APLICADA. Vive en `docs/multiempresa/sql/` porque el
-- directorio de migraciones aplicadas lo gobierna el sistema de migraciones y
-- este tramo NO autoriza escrituras ni DDL en produccion. Para aplicarla:
-- revisar aqui, aprobar y ejecutarla por el canal de migraciones habitual.
--
-- Contexto (auditoria del tramo 8): `assign_stamped_rep_number` recibia solo
-- el id del pago y actualizaba por PK, sin ninguna condicion de organizacion.
-- Con una segunda empresa activa eso permite que un proceso privilegiado
-- escriba el folio de un pago de otra empresa, y un reintento con folio
-- distinto sobreescribe en silencio el folio ya timbrado.
--
-- Cambios (sin tocar indices, esquema ni reglas de negocio):
--  1. Nuevo parametro OPCIONAL `p_organization_id`: NO se confia en el; se
--     valida CONTRA la organizacion del pago leida en la base. Si difiere se
--     rechaza con 42501. Nunca decide cual fila se actualiza.
--  2. El UPDATE lleva condicion explicita de organizacion.
--  3. Idempotencia: si el pago ya tiene el MISMO folio se devuelve tal cual
--     (recuperacion/reintento sin volver a timbrar). Si ya tiene otro folio se
--     rechaza con 23505 en vez de sobreescribirlo.
--  4. Pago sin organizacion => rechazo fail-closed.
--  5. Se CONSERVA el indice global `payments_rep_number_uidx`; el Lote 2 es un
--     cambio posterior e independiente. La autorizacion por rol se evalua
--     ANTES de cualquier lectura privilegiada.
--
-- Rollback: recrear la version de dos parametros documentada al final.
-- =====================================================================

DROP FUNCTION IF EXISTS public.assign_stamped_rep_number(uuid, text);

CREATE OR REPLACE FUNCTION public.assign_stamped_rep_number(
  p_payment_id uuid,
  p_folio text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_new_number text;
  v_payment_org uuid;
  v_existing text;
  v_found boolean;
  v_rows int;
BEGIN
  -- Autorizacion ANTES de cualquier lectura privilegiada.
  -- v_uid NULL = proceso interno (service_role / cron), igual que el resto de
  -- las funciones fiscales SECURITY DEFINER del proyecto.
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_folio IS NULL OR p_folio = '' THEN
    RAISE EXCEPTION 'folio required';
  END IF;

  v_new_number := 'CP-' || lpad(p_folio, 4, '0');

  SELECT true, organization_id, rep_number
    INTO v_found, v_payment_org, v_existing
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;

  IF v_payment_org IS NULL THEN
    RAISE EXCEPTION 'payment % has no organization; cannot assign REP folio',
      p_payment_id USING ERRCODE = '42501';
  END IF;

  -- El parametro no manda: se contrasta contra la organizacion del pago.
  IF p_organization_id IS NOT NULL AND p_organization_id <> v_payment_org THEN
    RAISE EXCEPTION 'payment % belongs to another organization', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  -- Idempotencia explicita para recuperacion/reintento.
  IF v_existing IS NOT NULL THEN
    IF v_existing = v_new_number THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION
      'rep_number % already assigned to payment % (requested %)',
      v_existing, p_payment_id, v_new_number
      USING ERRCODE = 'unique_violation';
  END IF;

  BEGIN
    UPDATE public.payments
       SET rep_number = v_new_number,
           rep_folio = p_folio
     WHERE id = p_payment_id
       AND organization_id = v_payment_org;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'payment % not found in its organization', p_payment_id
        USING ERRCODE = 'P0002';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'rep_number % already assigned (concurrent stamp)', v_new_number
      USING ERRCODE = 'unique_violation';
  END;

  RETURN v_new_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.assign_stamped_rep_number(uuid, text, uuid) IS
  'Asigna el folio REP (CP-####) al pago. La organizacion se valida contra la fila en base; el parametro solo sirve para rechazar cruces. Idempotente ante el mismo folio.';

-- ---------------------------------------------------------------------
-- Rollback (solo si fuera necesario revertir el tramo 8.1):
--   DROP FUNCTION IF EXISTS public.assign_stamped_rep_number(uuid, text, uuid);
--   -- y recrear la version historica de dos parametros
--   -- (ver supabase/migrations/20260811210858_*.sql).
-- ---------------------------------------------------------------------
