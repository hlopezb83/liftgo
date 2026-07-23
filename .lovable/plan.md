## Auditoría R10 · Fase 7 — cerrar Bloques 11, 12 y remate B10.2

Verifiqué el estado actual del plan y quedan estos hallazgos reales por atender (los demás ya se aplicaron en fases 1‑6):

### 🟡 Bloque 11 — Varios pendientes
1. **B11.4** — `MaintenancePage.tsx`: al mutar una OT, invalidar también la query del log individual (`maintenanceLogKeys.detail(id)`), no sólo la lista, para que el drill‑down refresque.
2. **B11.5** — Cambio de estatus de OT ↔ montacargas:
   - Al pasar OT a `in_progress`, invocar `change_forklift_status(forklift_id, 'maintenance', 'OT #folio')`.
   - Al pasar OT a `completed` o `cancelled`, revertir el estatus del montacargas a su estado previo (usar `previous_status` que ya guarda el RPC, con fallback `available`).
   - Implementarlo dentro de `useMaintenanceKanban`/`useMaintenanceLogs` en el mutate de status.
3. **B11.6** — `get_available_forklifts`: la condición actual filtra por rango exacto; cambiar a **traslape real** con la ventana solicitada (`b.start_date <= :end AND b.end_date >= :start`) para no ofrecer unidades ya reservadas parcialmente.

### 🔵 Bloque 12 — Bajos con menor riesgo
- **B12.1** Días de renta inclusivos: barrer utilidades donde se calcula `end - start` sin `+1` (bookings summary/preview) y unificar helper.
- **B12.4** Migración: `CHECK (stock_quantity >= 0)` en `parts_inventory`.
- **B12.7** `useCustomers.ts` update: agregar `.is('deleted_at', null)` para no revivir clientes archivados vía update.
- **B12.9** RPC `create_booking`: validar `customers.deleted_at IS NULL` antes de crear.
- **B12.10** `parseCfdiXml.ts`: parsear `Fecha` como date‑only local (evitar shift UTC).
- **B12.11** `STATUS_LABELS`: agregar `issued → "Emitida"`.
- **B12.13** `GlobalInvoiceFields.tsx`: prellenar `year` con el año actual (Monterrey).

### 🟠 Remate B10.2 — Dashboard utilization
`get_dashboard_stats` (migración 2026-07-22) calcula `utilization` y `monthly_utilization` con `LEAST/GREATEST` sin deduplicar traslapes por unidad y filtra `status='confirmed'` (excluye `completed`). Reescribir ambos bloques con **unión de rangos vía `generate_series`** (mismo patrón que `get_forklift_financials`) e incluir `status IN ('confirmed','completed')`. Sin cambiar el shape del JSON de salida.

## Detalles técnicos

- **Migraciones (3):**
  1. `get_dashboard_stats` v2 con dedupe por `generate_series` + `COUNT(DISTINCT d)`.
  2. `get_available_forklifts` con lógica de traslape.
  3. `parts_inventory` `ADD CONSTRAINT parts_inventory_stock_nonneg CHECK (stock_quantity >= 0)` y actualizar `create_booking` con guard de `deleted_at`.
- **Frontend:** cambios pequeños y localizados; sin refactor amplio.
- **Changelog:** entrada v7.198.0 (minor: agrupa Bloques 11+12 finales + fix dashboard).
- **Tests:** unit para helper `+1 día`, y prueba de que `get_dashboard_stats` no doble‑cuenta con dos bookings traslapados sobre la misma unidad (fixture SQL mínimo).

Con esto quedan cerrados todos los hallazgos accionables de R10.
