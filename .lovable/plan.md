## Diagnóstico

**Causa raíz: race condition** al convertir una cotización con varios equipos.

En `useQuoteBookingCreator.createBookingsFor` se invoca `createBooking.mutateAsync` con `Promise.all` (una llamada por equipo asignado). Cada llamada ejecuta el RPC `public.create_booking`, que en su interior hace:

```sql
v_booking_number := next_booking_number();  -- SELECT MAX(...) + 1
INSERT INTO bookings (... booking_number ...) VALUES (..., v_booking_number);
```

`next_booking_number()` solo lee `MAX(...) + 1`. No hay bloqueo. Cuando dos transacciones corren en paralelo, ambas leen el mismo MAX y calculan el mismo número (`RSV-0018`). Una hace commit primero; la segunda choca con el índice único `bookings_booking_number_key` → `23505`.

Los datos lo confirman: la reserva `RSV-0018` se creó a las **18:39:05.159**, y el error reporta **18:39:05.235** (76 ms después) — exactamente el mismo clic, dos inserts paralelos.

El mismo patrón existe en `next_quote_number`, `next_invoice_number`, etc., así que aplico la corrección al de bookings y dejo nota para replicar después si vuelve a pasar.

## Fix

Serializar la sección crítica con un **advisory lock transaccional** dentro del RPC `create_booking`. El lock se libera automáticamente al commit/rollback, no requiere infra extra y solo bloquea otras llamadas a `create_booking` (no toda la tabla).

### Migración

`ALTER FUNCTION public.create_booking` para que justo antes de `v_booking_number := next_booking_number()` haga:

```sql
PERFORM pg_advisory_xact_lock(hashtext('bookings.booking_number'));
```

Esto garantiza que dos inserts simultáneos se serialicen al asignar folio. El resto del RPC (validación de rol, verificación de disponibilidad, insert, update de forklift, status_log) queda igual.

### Sin cambios en frontend

`useQuoteBookingCreator` puede seguir usando `Promise.all`. Después del fix la conversión de una cotización con N equipos producirá N folios consecutivos sin colisiones.

## Limpieza de datos

No hay datos huérfanos que limpiar: la reserva `RSV-0018` válida ya está creada; lo que falló fue el segundo insert que nunca llegó a la tabla.

## Changelog

Entrada `patch` 6.76.3 en `public/changelog.json` + `public/changelog/v6.76.3.json`:
- Tipo: bugfix
- Título: "Evitar folios duplicados al crear varias reservas en paralelo"
- Descripción: "Al convertir una cotización con varios equipos, dos reservas podían recibir el mismo folio (RSV-XXXX) y la segunda fallaba. Se serializa la asignación de folio con un bloqueo transaccional."

## Fuera de alcance

- No se modifica `next_quote_number`, `next_invoice_number`, etc. Si se observan colisiones similares ahí, se aplicará el mismo patrón en una iteración posterior.
- No se cambia el front (no es necesario).
