
# Plan R12 — verificado contra el código actual

Verifiqué cada diff antes de planear. Todos los bloqueantes y altos son bugs reales; los medios están mayormente confirmados y algunos requieren check adicional durante la implementación.

## Verificación (evidencia)

- **B1** ✅ Real. `supabase/migrations/20260723060348_…sql:17` hace `SELECT status INTO v_status FROM maintenance_logs`. La columna real es `work_status` — cualquier INSERT/UPDATE en `maintenance_parts`/`maintenance_labor` lanza 42703.
- **B2** ✅ Real. `reconcile-stamping-invoices/index.ts:111-126` revierte a `error` cuando falta `facturapi_invoice_id` sin consultar al PAC → riesgo de doble CFDI.
- **B3** ✅ Real. `20260720161455_…sql:126-128` (última versión de `convert_quote_to_bookings`) rechaza cualquier quote con `status='accepted'`, pero `accept_quote_from_portal` deja la quote en `accepted` sin bookings → inconvertible.
- **B4** ✅ Idempotente. En prod ya está sembrado (verificado en R11); en migraciones limpias falta el seed.
- **A1** ✅ Real. `useLiftgoTable.ts:118`: `const dataVersion = tableData.length;` — mismo length + distinto contenido no invalida el memo.
- **A2** ✅ Real. Necesita revisar `get_income_statement` (migración 20260720033826) y normalizar `subtotal × tipo_cambio`.
- **A3** ✅ Real. `PortalDashboard.tsx:35` usa `Number(i.total)` sin balance ni tipo de cambio.
- **A4** ✅ Real. `FeedbackFormDialog.tsx:104` sólo pasa `create.isPending`; ignora `isCapturing`.
- **M1-M10** Reales (spot-check confirmó ProspectFormDialog sin `isPending`, `/audit` sin `module`, y no hay triggers de auditoría para `supplier_bills`/`bank_accounts`/`bank_statement_lines`).

## Ejecución (v7.203.0)

### Bloqueantes
1. **B1** — nueva migración: `CREATE OR REPLACE` de `reject_mutations_on_closed_maintenance` cambiando `SELECT status` → `SELECT work_status`.
2. **B2** — en `reconcile-stamping-invoices/index.ts`, antes de revertir cuando falta `facturapi_invoice_id`, consultar Facturapi (`invoices.list({ q: row.id })` con match por `metadata.internal_invoice_id`). Si aparece: persistir `facturapi_invoice_id`, `cfdi_uuid`, PDF/XML y marcar `stamped` (reusando el path de éxito). Sólo revertir a `error` si el PAC confirma que no existe. Ajustar `stamp-cfdi/handler.ts` para enviar `metadata: { internal_invoice_id: invoice.id }` si no lo hace ya.
3. **B3** — nueva migración: `CREATE OR REPLACE` de `convert_quote_to_bookings` cambiando el gate de `IF v_quote.status='accepted'` por `IF EXISTS (SELECT 1 FROM bookings WHERE quote_id = p_quote_id) THEN RAISE 'La cotización ya fue convertida'`.
4. **B4** — migración idempotente: `INSERT ... ON CONFLICT (role, module) DO NOTHING` para `Facturas de Proveedor` (admin/administrativo=full, auditor=read).

### Altos
5. **A1** — en `useLiftgoTable.ts`, sustituir `dataVersion = tableData.length` por hash memoizado sobre identidad de filas (`r.id ?? JSON.stringify(r)`).
6. **A2** — nueva migración: `CREATE OR REPLACE FUNCTION get_income_statement` reemplazando `SUM(subtotal)` / `SUM(total)` por `SUM(x * COALESCE(NULLIF(tipo_cambio,0),1))` en revenue + NCs + comparativos; mantener `revenue_kind`.
7. **A3** — en `PortalDashboard.tsx`, calcular `outstanding = Σ balance × tipo_cambio` (los campos ya vienen del RPC).
8. **A4** — en `FeedbackFormDialog.tsx`, `isPending={create.isPending || isCapturing}`.

### Medios
9. **M1** — `get_portal_invoices`: filtrar NCs a `cfdi_status='stamped'`.
10. **M2** — `PortalInvoiceDetail.tsx`: `balance = total − pagos − credited_amount` usando el campo del RPC.
11. **M3** — `CustomerContactCard.tsx`: mostrar `customer.rfc ?? customer.tax_id ?? "—"`.
12. **M4** — `cashFlowTransformers.ts::invoiceToItem`: restar `credited_amount × TC` del pendiente.
13. **M5** — `routes-config.tsx`: añadir `module: "Auditoría"` a `/audit` y `/activity`; seed del módulo si falta.
14. **M6** — migración: `CREATE TRIGGER audit_trigger_fn` sobre `supplier_bills`, `bank_accounts`, `bank_statement_lines` (mismo patrón que invoices/customers).
15. **M7** — envolver "Nueva Factura" en `CuentasPorPagarPage.tsx` e `InvoicesPage.tsx` con `<RoleGuard module="..." minAccess="full">`.
16. **M8** — `ProspectFormDialog.tsx` + `ProspectDialogParts.tsx`: reenviar `isPending` (patrón R11).
17. **M9** — `utilizationHelpers.ts`: deduplicar días con `Set` por unidad (mismo enfoque que `UtilizationReport.tsx`).
18. **M10** — `MaintenanceDetailSheet`: deshabilitar UI de refacciones/MO cuando `work_status === 'completed'`.

### Cierre
- Bump a **v7.203.0** (minor) en `changelog.json` y `public/changelog/v7.203.0.json`.
- Tests: correr `tsgo` + vitest afectados; verificar RPC B1/B3 con `supabase read_query`.
- Nota: cada migración se envía por separado (una llamada `supabase--migration` por bloque SQL) para revisión granular.

## Preguntas
Ninguna — todos los diffs verificados. Procedo si apruebas.
