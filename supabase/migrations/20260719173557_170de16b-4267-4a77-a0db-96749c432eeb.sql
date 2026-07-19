
-- Defensa en profundidad: además del trigger que ya limpia al cancelar,
-- prohibimos por esquema el par inválido. Es una regla inmutable
-- (sin funciones volátiles), así que un CHECK constraint es adecuado.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_cancelled_not_recurring
  CHECK (NOT (status = 'cancelled' AND recurring_billing = true));

COMMENT ON CONSTRAINT bookings_cancelled_not_recurring ON public.bookings IS
  'Una reserva cancelada no puede conservar facturación recurrente activa. Complementa trg_bookings_clear_recurring_on_cancel (v7.98.2).';
