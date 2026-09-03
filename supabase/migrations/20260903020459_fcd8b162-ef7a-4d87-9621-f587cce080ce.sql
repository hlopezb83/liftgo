-- Corrección Hallazgo 7: el índice parcial prospectivo (corte por created_at)
-- NO bloqueaba el primer contrato nuevo de una reserva cuyos contratos no
-- cancelados fueran todos anteriores al corte. Se reemplaza por un trigger
-- transaccional que valida contra TODOS los contratos sin importar fecha,
-- preservando intactos los duplicados históricos CTR-0002/CTR-0003.

DROP INDEX IF EXISTS public.contracts_one_active_per_booking;

CREATE OR REPLACE FUNCTION public.enforce_one_active_contract_per_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Contratos sin reserva o cancelados nunca chocan (se permiten múltiples
  -- cancelados por reserva, incluida la cancelación de un duplicado histórico).
  IF NEW.booking_id IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- En UPDATE sólo validamos cambios de reserva o reactivaciones
  -- (cancelled → no cancelado). Editar un contrato ya vigente —incluidos los
  -- duplicados históricos CTR-0002/CTR-0003— no se bloquea.
  IF TG_OP = 'UPDATE'
     AND OLD.booking_id IS NOT DISTINCT FROM NEW.booking_id
     AND OLD.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Candado transaccional por reserva: dos transacciones concurrentes sobre
  -- la misma booking_id se serializan aquí; la segunda espera el commit de la
  -- primera y su verificación ve el contrato ya confirmado (READ COMMITTED).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('contracts_one_active_per_booking:' || NEW.booking_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.booking_id = NEW.booking_id
      AND c.status <> 'cancelled'
      AND c.id <> NEW.id
  ) THEN
    -- Mismo SQLSTATE y nombre que reconoce la UI (useCreateContract → 23505 +
    -- "contracts_one_active_per_booking" → "Ya existe un contrato para esta reserva").
    RAISE EXCEPTION 'duplicate key value violates unique constraint "contracts_one_active_per_booking"'
      USING ERRCODE = '23505',
            CONSTRAINT = 'contracts_one_active_per_booking',
            DETAIL = format('Ya existe un contrato no cancelado para la reserva %s.', NEW.booking_id),
            HINT = 'Cancela el contrato existente antes de crear o reactivar otro para esta reserva.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_one_active_per_booking ON public.contracts;
CREATE TRIGGER trg_contract_one_active_per_booking
BEFORE INSERT OR UPDATE OF booking_id, status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_one_active_contract_per_booking();