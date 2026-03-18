

# Plan: Consecutivos para Entregas (ENT-) y Devoluciones (DEV-)

## Resumen
Agregar identificadores secuenciales automáticos a entregas (`ENT-0001`) y devoluciones (`DEV-0001`), siguiendo el mismo patrón usado en reservas (`RSV-`).

## Cambios en Base de Datos (2 migraciones)

### Migración 1: Entregas (`deliveries`)
- Agregar columna `delivery_number text UNIQUE`
- Backfill registros existentes con `ENT-` + número secuencial ordenado por `scheduled_date`
- Marcar `NOT NULL` después del backfill
- Crear función `next_delivery_number()` (mismo patrón que `next_booking_number`)

### Migración 2: Devoluciones (`return_inspections`)
- Agregar columna `inspection_number text UNIQUE`
- Backfill existentes con `DEV-` + número secuencial ordenado por `inspected_at`
- Marcar `NOT NULL` después del backfill
- Crear función `next_inspection_number()`
- Actualizar el RPC `complete_return_inspection` para auto-asignar `inspection_number`

## Cambios en Código

### `src/hooks/useDeliveries.ts`
- En `useCreateDelivery`, antes de insertar, llamar `next_delivery_number()` vía RPC o bien asignarlo server-side. Dado que la creación es un simple insert (no RPC), la opción más limpia es agregar un **trigger BEFORE INSERT** en la migración que auto-asigne el número si es NULL. Así no se requiere cambio en el hook.
- Alternativa: Usar un trigger `BEFORE INSERT` que llame `next_delivery_number()` automáticamente (más robusto, sin cambios en frontend).

### `src/pages/DeliveriesPage.tsx`
- Agregar columna "Entrega #" en la tabla (desktop y mobile)
- Mostrar `delivery_number` como primera columna

### `src/pages/ReturnInspectionPage.tsx`
- Agregar columna "Devolución #" en la tabla (desktop y mobile)
- Mostrar `inspection_number` como primera columna

### `src/lib/changelog.ts`
- Bump versión a v3.54.0

## Decisión técnica
Usar **triggers BEFORE INSERT** para ambas tablas, igual que se hizo con bookings (pero con trigger en vez de RPC). Esto es más robusto porque no importa cómo se inserte el registro (hook, RPC, directo), siempre tendrá número. El RPC `complete_return_inspection` se actualizará para incluir la columna en el INSERT.

