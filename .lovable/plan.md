## Objetivo

Convertir la tarjeta "Historial de Estatus" de la página de reserva (`/bookings/:id`) en un **Historial de Reserva** completo: incluir todos los campos modificados (no solo `status`), el autor de cada cambio, y enriquecerlo con eventos relacionados (extensiones, entregas/devoluciones, pagos).

Solo cambios de presentación + un hook de datos. Sin cambios de schema ni de lógica de negocio.

## Alcance

Aplica únicamente a `src/features/bookings/components/bookings/BookingStatusHistory.tsx` y su hook. Se renombra a `BookingHistory` semánticamente, pero **se mantiene el mismo archivo y exports** para no tocar `BookingDetail.tsx` más allá del título visible.

## Cambios

### 1. Hook `useBookingStatusHistory` → `useBookingHistory`

Archivo: `src/features/bookings/hooks/bookingDetail/useBookingStatusHistory.ts`

- Quitar el filtro `.contains("changed_fields", ["status"])` para traer **todos** los cambios de la reserva.
- Mantener `table_name='bookings'` y `record_id=bookingId`, orden descendente.
- Después del fetch principal, hacer un segundo query a `profiles` (`user_id, full_name`) con los `user_id` únicos para resolver el autor (mismo patrón que `useAuditLogs`).
- Retornar `Array<AuditLog & { user_name?: string }>`.

### 2. Componente `BookingStatusHistory`

- Renombrar título visible a **"Historial de la Reserva"**.
- Para cada log calcular `changed_fields` y renderizar una fila por campo cambiado, con un mapa de labels en español:
  - `status` → "Estatus" (sigue mostrando `StatusBadge` antes/después)
  - `start_date`, `end_date` → fechas DD/MM/YYYY
  - `monthly_rate` → `formatCurrency`
  - `forklift_id` → "Equipo asignado" (mostrar UUID corto)
  - `customer_id`, `customer_name`, `site_contact_name`, `site_contact_phone`, `notes`, `included_hours`, `extra_hour_rate`, etc. → labels legibles; valores como texto.
  - Fallback genérico: nombre del campo + `String(old) → String(new)`.
- Cada entrada muestra: fecha/hora DD/MM/YYYY HH:mm, autor (`user_name` o "Sistema"), acción (`INSERT`/`UPDATE`/`DELETE` traducido: "Creación", "Actualización", "Eliminación"), y la lista de campos cambiados.
- Para `INSERT` mostrar "Reserva creada por {autor}"; para `DELETE` "Reserva eliminada".
- Mantener empty state y skeleton existentes.

### 3. Estructura visual (timeline)

```text
●  23/06/2026 15:42 · Sonia Hernández · Actualización
│    Estatus: [Reservada] → [Confirmada]
│    Tarifa mensual: $12,000 → $13,500 MXN
●  20/06/2026 10:11 · Hector López · Creación
     Reserva creada
```

Bullet + línea vertical sutil con `border-l` en `text-muted-foreground/30`.

## Detalles técnicos

- Reusar `formatCurrency` de `@/lib/format/formatCurrency` y `format` de `date-fns`.
- Mapa de labels en una constante local (`FIELD_LABELS: Record<string, string>`) dentro del componente; campos no mapeados se muestran con su nombre crudo.
- No tocar el trigger de auditoría: ya registra todos los cambios en `audit_logs` (verificado: 9 columnas, `changed_fields text[]`, `old_data/new_data jsonb`, `user_id uuid`).
- `user_id` puede ser `null` (cambios del sistema/triggers) → mostrar "Sistema".
- Sin cambios a `bookings`, ni nuevos endpoints, ni RPCs.

## Changelog

Agregar entrada `patch` (6.76.2) en `public/changelog.json` y `public/changelog/v6.76.2.json`:
- Título: "Historial completo de la reserva con autor"
- Descripción: "El detalle de cada reserva ahora muestra todos los cambios (estatus, fechas, tarifa, equipo, cliente…) con el nombre del usuario que los hizo."

## Fuera de alcance

- No se agregan eventos cruzados (extensiones, entregas, pagos) en esta iteración — se puede hacer después si lo deseas.
- No se modifica la vista global `/auditoria`.
