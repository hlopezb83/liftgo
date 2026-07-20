## Plan de remediación — Auditoría ronda 4 (BL-53 a BL-57 + DRIFT-01)

Ejecutar en un solo sprint con foco en integridad de datos e inventario. Todo vía migraciones Supabase (más ajustes menores de frontend cuando aplique). Cada fix con changelog patch/minor incremental y tests en Vitest/Deno según corresponda.

### P0 — BL-53: Doble descuento de stock (HIGH)

Migración:

- `DROP TRIGGER trg_decrement_stock ON maintenance_parts` + `DROP FUNCTION handle_part_usage()` (redundante con `adjust_part_stock_on_maintenance_part` que sí valida INSERT/UPDATE/DELETE + stock).
- Script de reconciliación **una sola vez**: recalcular `parts_inventory.stock` para las refacciones tocadas desde `2026-07-19` sumando el consumo histórico real de `maintenance_parts` y ajustando la diferencia (log a `audit_logs`).

Test: Vitest de RPC que inserta `maintenance_parts` y verifica descuento exacto (no doble).

### P0 — BL-55: Daños en devolución no se registran (HIGH)

Migración a `complete_return_inspection`:

- Cuando `p_condition IN ('damaged','needs_repair')` y `p_damage_cost > 0`:
  - `INSERT INTO damage_records(inspection_id, forklift_id, booking_id, customer_id, description, estimated_cost, status='pending')`.
  - `UPDATE forklifts SET status = 'maintenance'` (no `available`).
- Rama `else`: `status = 'available'` como hoy.

Test: Deno test del RPC — condition=damaged crea 1 damage_record y deja forklift en maintenance.

### P1 — BL-54: `cost_at_time` snapshot + recálculo destructivo (MEDIUM)

Dos cambios:

1. Trigger `BEFORE INSERT` `snapshot_part_cost()` en `maintenance_parts`: si `cost_at_time` es null/0, hidrata desde `parts_inventory.unit_cost`.
2. `recalc_maintenance_log_cost`: preservar el costo manual. Agregar columna `maintenance_logs.manual_cost numeric` (nueva) y calcular `cost = COALESCE(manual_cost, 0) + Σ(parts) + Σ(labor)`. Migración de datos: si el log tiene cost > 0 y no hay parts/labor, copiar a `manual_cost`.

Frontend: `MaintenancePartsSection` ya envía cost_at_time — se mantiene; formulario de log muestra "Costo manual adicional" apuntando a `manual_cost`.

Tests: Vitest sobre recalc con combinaciones (solo manual, solo partes, mezcla).

### P1 — BL-56: KPI "por cobrar" incluye borradores (MEDIUM)

Migración a `get_dashboard_stats`:

```sql
WHERE v.status IN ('sent','partial','overdue')
  AND COALESCE(v.cancellation_status,'') <> 'accepted'
```

Test: Vitest que inserta 1 draft + 1 sent y verifica que outstanding solo cuenta el sent.

### P2 — BL-57: Mezcla de monedas en agregados (MEDIUM-HIGH)

Migración:

- Recrear `v_invoices_with_balance` agregando `balance_mxn = ROUND(balance * COALESCE(NULLIF(tipo_cambio,0), 1), 2)` y `total_mxn` análogo.
- Actualizar `get_dashboard_stats`, `v_overdue_invoices`, `get_customer_summary` y aging para sumar `balance_mxn`.
- Sin cambios de UI: los cards ya muestran MXN — solo cambia la fuente.

Test: Vitest inserta factura USD (tipo_cambio 18.5) y verifica que outstanding se convierte a MXN.

### P2 — DRIFT-01 residual: orden de migraciones en frío (MEDIUM)

Envolver los REVOKE/policy conflictivos en guardas `DO $$ IF EXISTS (…) THEN … END IF $$` mediante una migración nueva (`20260720170000_drift_backfill_guards.sql`) que:

- Recrea la policy sobre `collection_reminders_log` con `IF EXISTS` sobre pg_class.
- Recrea los REVOKE con `IF EXISTS` sobre pg_proc.

No se re-timestampan migraciones existentes (romperíamos historial). Verificar rebuild en frío con `supabase db reset` local si hay CLI disponible; si no, dejar documentado en el changelog.

### Changelog

Una entrada por cada BL en `public/changelog/v7.109.0.json` (minor por magnitud + cambios estructurales), más índice en `public/changelog.json`. Documentar el script de reconciliación de stock de BL-53 explícitamente.

### Fuera de alcance

- Backfill masivo histórico de `damage_records` para devoluciones ya cerradas antes del fix (solo aplica desde v7.109.0).
- Migración retroactiva de logs de mantenimiento con cost sobreescrito a 0: se listan en el changelog para revisión manual.
- Cambios de UI en el módulo de daños/mantenimiento más allá de exponer `manual_cost`.

### Preguntas antes de ejecutar

1. Reconciliación de stock (BL-53): ¿aplico el ajuste automático desde `2026-07-19` o solo genero un reporte en `/mnt/documents/` para que revises antes? aplica el ajuste
2. Logs de mantenimiento con `cost=0` por BL-54: ¿los intento recuperar copiando `cost` histórico desde `audit_logs`, o los dejo para revisión manual con lista adjunta? revision manual