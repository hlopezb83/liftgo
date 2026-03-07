

## Plan: Alerta de Rentas Vencidas en el Panel (v3.17.6)

### Problema
Cuando un montacargas está rentado pero su reserva ya venció (end_date < hoy) y no se ha registrado devolución (status sigue en "confirmed"), no hay visibilidad en el Panel.

### Solución
Agregar una nueva sección de alerta "Rentas Vencidas" en el dashboard que muestre reservas confirmadas cuyo `end_date` ya pasó, incluyendo días de retraso.

### Cambios

**1. Migración SQL — Actualizar `get_dashboard_stats`**
Agregar un nuevo campo `overdue_bookings` al JSON que retorna la función:
```sql
SELECT bookings con status='confirmed' AND end_date < CURRENT_DATE
JOIN forklifts para obtener nombre del equipo
```
Campos: booking_id, forklift_name, forklift_id, customer_name, end_date, days_overdue.

**2. `src/hooks/useDashboardStats.ts`**
Agregar tipo `overdue_bookings` al interface `DashboardStats`.

**3. `src/pages/Dashboard.tsx`**
Extraer `overdueBookings` del stats y pasarlo a `AlertsRow`.

**4. `src/components/dashboard/AlertsRow.tsx`**
- Agregar prop `overdueBookings`
- Renderizar nueva carta con icono de alerta naranja/rojo
- Cada fila muestra: nombre del equipo, cliente, días de retraso
- Botón de acción que navega a `/returns?booking_id={id}` para registrar la devolución
- Incluir en la condición de visibilidad del componente

**5. `src/lib/changelog.ts`** — v3.17.6

