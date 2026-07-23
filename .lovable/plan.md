## Auditoría R10 — verificación y plan de corrección

Verifiqué la BD y los 4 archivos críticos citados. Confirmo bugs, un stale y un matiz importante:

- **B1 ✅ real:** `ReturnInspectionDialog.tsx:99` usa `<FormLabel>` fuera de `FormField` (para las fotos de inspección); `RegisterSupplierPaymentDialog.tsx:161` usa `FormItem/FormLabel/FormControl` sin `FormField`. `useFormField` (`src/components/ui/form.tsx`) llama `useFormState({control, name: fieldContext.name})` **antes** de validar `fieldContext` → crashea ambos diálogos.
- **B2 ✅ real:** `maintenanceFormHelpers.ts:11` declara `cost: z.string()`, pero `CurrencyField` emite `number|null`. El submit falla.
- **B3 ⚠️ stale:** las 3 filas de `Facturas de Proveedor` ya existen (admin/administrativo/auditor con acceso correcto, migración 2026-06-09). Si aún sale NoAccess, el bug real está en el módulo declarado por `routes-config` vs. el string almacenado, o en el hook de permisos — **investigar antes de aplicar cualquier INSERT** (no re-seed a ciegas).
- **B4–B12:** los cito por número; cada uno con archivos y capas indicadas por la auditoría R10.

## Alcance del plan

Aplicar en orden por criticidad hasta agotar razonable en un solo turno. Si algo excede el turno, corto en B11 y sigo en el próximo.

### 🔴 Bloque 1 — Endurecer `useFormField` + corregir 2 diálogos
- `src/components/ui/form.tsx`: reestructurar `useFormField` para llamar hooks siempre (`useFormState` con `name="__orphan__"` fallback) y degradar a estado neutro cuando no hay `fieldContext` (nunca throw).
- `ReturnInspectionDialog.tsx:99`: sustituir `<FormLabel>` por `<Label>` de `@/components/ui/label` (las fotos no son campo del form).
- `RegisterSupplierPaymentDialog.tsx:161`: sustituir el bloque `FormItem/FormLabel/FormControl` por un `<Label>` + `<ReceiptField>` directo (o `FormField` real si se decide meter el file al form).
- Barrido: `rg "FormLabel|FormControl" src/features/{returns,accounts-payable,deliveries,maintenance}` para detectar otros huérfanos.

### 🔴 Bloque 2 — Costo en OT
- `maintenanceFormHelpers.ts`: `cost: z.coerce.number().nonnegative().nullable().optional()` con default `null`; ajustar `initialMaintenanceForm`, `maintenanceLogToFormValues` y `buildMaintenancePayload` para trabajar con number.
- **B5 juntos:** enviar el valor a `manual_cost` (no `cost`), y prellenar desde `manual_cost` al editar. `cost` queda como columna calculada por trigger.

### 🔴 Bloque 3 — Diagnóstico permisos CxP (no re-seed)
- Verificar el string exacto del módulo en `routes-config.tsx` para `/cuentas-por-pagar*` y confirmar que coincide con `Facturas de Proveedor` en BD. Si es un mismatch (p.ej. "Cuentas por Pagar"), corregir en el config o agregar la fila que falte.
- Marcar B3 como stale si el string ya coincide.

### 🟠 Bloque 4 — Horómetro decreciente
- Validación en `buildCompletionPayload` (throw si `pickup_hours < delivery_hours`).
- Schema en `DeliverySignatureDialog` con `refine` + mostrar horómetro de entrega como referencia.
- Migración: `CHECK`/trigger en la tabla de pickup para `pickup_hours >= delivery_hours`.

### 🟠 Bloque 6 — Pago con REP no editable
- `usePaymentHistoryColumns.tsx`: ocultar/deshabilitar editar cuando `rep_cfdi_status='stamped'` (tooltip explicativo).
- `EditPaymentDialog.tsx`: guard early-return si REP timbrado.
- Migración: trigger `BEFORE UPDATE ON payments` que rechace cambios de monto/fecha/moneda/forma_pago_sat cuando `rep_cfdi_status='stamped'`.

### 🟠 Bloque 7 — Devolución anticipada
- `BookingActions.tsx:81`: navegar a `/returns?booking=<id>&early=1`.
- `ReturnInspectionPage.tsx` + `useReturnInspectionDialog.ts`: si `early=1`, aceptar `in_progress` sin exigir `end_date<=hoy`; copy "Devolución anticipada — la renta se cerrará hoy".

### 🟡 Bloque 8 — Fiscal
- (1) `z.date().max(new Date())` + `disabled={{ after: new Date() }}` en record/edit pago.
- (2) `stamp-payment-complement`: `EquivalenciaDR = 1` cuando `paymentCurrency === invoiceCurrency`.
- (3) Migración: `v_invoices_with_balance` — filtrar NC por `cfdi_status='stamped'`.
- (4) `useStampInvoiceFlow.ts`: early-return en `onError` si `isBenignStampError(raw)`.

### 🟡 Bloque 9 — Rentas/devoluciones
- (1) `useBookingActions.ts`: `await mutateAsync` + toast solo tras éxito.
- (2) RPC `cancel_booking`: cancelar deliveries pendientes/programadas en la misma transacción.
- (3) RPC `complete_return_inspection`: idempotencia + validación temporal (`inspected_at >= booking.start_date` y no futura lejana).

### 🟡 Bloque 10 — Reportes/flota
- (1) `UtilizationReport.tsx`: clamp+dedupe rangos por unidad.
- (2) `get_forklift_financials` y `get_dashboard_stats`: unión de rangos, `acquisition_date` con fallback `created_at`, consistencia con `+1 día`.
- (3) `get_insurance_alerts`: `AND deleted_at IS NULL`.
- (4) `useForklifts.ts`: filtrar `deleted_at IS NULL` en detalle (mostrar "no encontrado").

### 🟡 Bloque 11 — Varios (los que entren)
- (1) `FormDialog.tsx`: bloquear Esc/interact-outside cuando `isPending`.
- (2) `quoteFormSchema.ts`: `valid_until` no pasado al crear.
- (3) `PortalQuoteDetail.tsx:88`: usar `it.total ?? it.amount ?? 0`.
- (4) `MaintenancePage.tsx`: invalidar query del log individual.
- (5) OT `in_progress` → `change_forklift_status('maintenance', "OT #folio")` y revertir al completar/cancelar.
- (6) `get_available_forklifts`: cambio de condición a traslape con ventana solicitada.

### 🔵 Bloque 12 — Bajos (subset con menor riesgo)
- (1) Renta 1 día muestra "0 días" → `(end - start) + 1`.
- (3) Bloquear refacciones/MO en OT `completed` (UI + trigger).
- (4) Migración `CHECK (stock_quantity >= 0)` en `parts_inventory`.
- (7) `useCustomers.ts` update: `.is('deleted_at', null)`.
- (9) `create_booking`: validar `deleted_at IS NULL` del cliente.
- (10) `parseCfdiXml.ts:42`: fecha CFDI parseada como date-only local.
- (11) `STATUS_LABELS`: agregar 'issued' → "Emitida".
- (13) `GlobalInvoiceFields.tsx`: prellenar Año actual.

## Detalles técnicos

- **Migraciones DB (5):** trigger `payments_reject_fiscal_update_when_rep`, `CHECK` horómetro en pickups, `v_invoices_with_balance` v2, `CHECK stock_quantity >= 0`, cancelación de deliveries en `cancel_booking` + idempotencia/temporal en `complete_return_inspection`.
- **Tests:** un test mínimo por diálogo listado para no reintroducir el crash de B1; unit test para `useFormField` degradando sin throw; tests para clamp/dedup en UtilizationReport y `+1 día` en booking-days.
- **Versionado:** bump a **v7.192.0** (minor: cambios de contrato en DB y validaciones nuevas). Actualizar `public/changelog.json` + `public/changelog/v7.192.0.json`.
- **Fuera de alcance de este turno:** B12 items 2, 5, 6, 8, 12, 14 (bajos con menor impacto y más discusión de producto). Se documentan como deuda para R11.

Ejecuto en orden: B1 → B2/B5 → B3(diagnóstico) → B4 → B6 → B7 → B8 → B9 → B10 → B11 → B12(subset) → tests → changelog.