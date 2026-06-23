## Objetivo

Bloquear la creación **manual/directa** de reservas para todos los roles excepto **Admin**. Para crear una reserva, los demás roles deben partir de una cotización aceptada y usar el flujo "Convertir a reserva".

## Comportamiento actual

- `/bookings/new` (BookingForm) está accesible para Admin, Administrativo, Despachador y Ventas.
- La RPC `create_booking` permite los 4 roles indistintamente, sin distinguir si la reserva proviene de una cotización.
- El flujo "Convertir cotización → reservas" (`useQuoteBookingCreator`) crea bookings con la misma RPC y luego les setea `quote_id`.

## Comportamiento nuevo

- Solo **Admin** puede acceder a `/bookings/new` y al botón "Nueva Reserva" en la lista.
- Los roles **Administrativo, Despachador, Ventas** ya no ven el botón ni la ruta directa, pero pueden seguir convirtiendo cotizaciones a reservas.
- A nivel DB, la RPC `create_booking` exige que se pase `p_quote_id` cuando el caller no es admin. Si es admin, `p_quote_id` puede ser NULL (reserva directa permitida).

## Cambios técnicos

### Base de datos (migración)

Reescribir `public.create_booking` agregando parámetro opcional `p_quote_id uuid DEFAULT NULL`:

```sql
IF NOT has_role(auth.uid(), 'admin') THEN
  -- No-admins solo pueden crear reservas vinculadas a una cotización
  IF p_quote_id IS NULL THEN
    RAISE EXCEPTION 'Solo administradores pueden crear reservas directas. Crea una cotización primero.';
  END IF;
  IF NOT (has_role(auth.uid(), 'administrativo') OR has_role(auth.uid(), 'dispatcher') OR has_role(auth.uid(), 'ventas')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = p_quote_id) THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;
END IF;
```

Además, **incluir `quote_id` directamente en el INSERT** para evitar el `UPDATE` posterior:

```sql
INSERT INTO bookings (..., quote_id) VALUES (..., p_quote_id) ...
```

Mantener `SECURITY DEFINER` y `SET search_path = public`.

### Frontend

`src/features/bookings/hooks/useBookingMutations.ts`
- Extender el hook para pasar `p_quote_id: booking.quote_id ?? undefined` en el `rpc('create_booking', ...)`.

`src/features/quotes/hooks/quoteDetail/useQuoteBookingCreator.ts`
- En cada `createBooking.mutateAsync({...})` agregar `quote_id: quote.id`.
- Eliminar el `update({ quote_id })` posterior (ya no necesario porque el INSERT lo trae).

`src/features/bookings/pages/BookingsPage.tsx`
- Envolver botones "Nueva Reserva" (header, FAB, empty state) y `usePageActions onNew` con check de rol: solo se muestran si `useUserRole().data === "admin"`.

`src/routes/routes-config.tsx`
- Para la ruta `/bookings/new`, agregar un guard de admin. Si existe patrón previo (revisar otras rutas restrictivas), reutilizarlo; si no, usar `RoleGuard` con un check específico de admin o un nuevo `<AdminOnlyGuard>` envolviendo el componente lazy.

### Tests

- Actualizar `src/features/bookings/__tests__/bookingFlow.test.ts` para incluir `p_quote_id` en los args esperados del RPC mock.
- Agregar caso: no-admin sin `quote_id` recibe error de la RPC.

### Changelog
- Nueva entrada `v6.79.0` (minor): "Reservas solo desde cotización para roles distintos a Admin".

## UX
- Texto en la página de Reservas para no-admins (banner pequeño o tooltip en el botón ausente): "Para crear una reserva, parte de una cotización aceptada y conviértela desde el detalle." (opcional, puede incluirse o dejarse fuera).

## Fuera de alcance
- No se modifican las políticas RLS de `bookings` (la validación de origen se hace en la RPC, único punto de creación).
- No se altera el flujo de edición, cancelación, extensión, ni la lista de reservas.
- No se cambia la facturación, conversión a factura ni recurring billing.
