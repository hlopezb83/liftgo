# Estado del plan DRY · Pendientes

Recorriendo el plan original (`.lovable/plan.md`, estimado ~1,380 LOC) y los changelogs entregados (`v6.141.0` → `v6.148.2`), esto es lo que **ya está hecho** y lo que **queda pendiente**.

## ✅ Completado

- **Lote 1 — Edge Functions (parcial):** `requireAdmin`/`requireRole`, `jsonResponse`/`jsonError`, refactor de `delete-user`, CFDI stampers, `refresh-cancellation-status`, formateo `deno fmt`, fix ReferenceError `jsonHeaders` (`v6.141.0`-`v6.143.0`, `v6.148.1`, `v6.148.2`).
- **Lote 2 — Hooks (mayor parte, ~5 partes):** Supplier Bills, Bank Line Actions, Audit Logs, Bill Approvals, Suppliers, Company Settings, Payment Batches, Booking Extensions, Invoices/CFDI/REP, Bank Imports, Receptor Fiscal Info, Recurring Invoices Preview (`v6.144.0`-`v6.148.0`).

## ⏳ Pendiente

### Lote 1 — Edge Functions (resto)
- **`_shared/facturapi.ts::getFacturapiConfig(admin)`** — centralizar lectura de `company_settings.facturapi_mode` + `billing_secrets` (hoy repetido en stamp-cfdi, stamp-credit-note, stamp-payment-complement, cancel-*).
- **`_shared/cfdi.ts`** — unificar parsers XML CFDI (hoy `validate-supplier-rep` reimplementa lo que ya vive en `parse-cfdi-expense/cfdi-parser.ts`).
- **72 → resto de `new Response(JSON.stringify(...))`** en funciones no migradas todavía (validate-supplier-rep, cancel-credit-note, generate-invoice-pdf, parse-csf, invite-*).

Ahorro estimado restante: **~200-250 LOC**.

### Lote 2 — Hooks (cola)
Todavía en `useMutation` crudo:
- `useForkliftMutations.ts` (~28 LOC) — usa `setQueryData` optimista; requiere extender `useEntityMutation` con opción `optimistic` **o** dejarlo fuera de alcance (marcado como opcional).
- `useCashFlowSettings.ts` (~15 LOC).
- `useInviteUser.ts` (~12 LOC).
- `useBookings.ts` create/update (~12 LOC).
- `useCreatePaymentIntent.ts` (~10 LOC).
- `useSuppliers.ts` create/update (~22 LOC) — marcado fuera de alcance por `translateSupplierError`.

Ahorro estimado restante: **~60-80 LOC** (sin contar optimistic).

### Lote 4 — Utils / Schemas / Rules (en progreso)
- ✅ IVA hardcodeado `* 1.16` → `applyVat` / `DEFAULT_VAT_RATE` (`v6.150.0`).
- ✅ `TotalsBreakdown` compartido en portal + 5 hooks read-only migrados a `callRpc<T>()` (`v6.151.0`).
- Restantes ~10 hooks con `supabase.rpc(...)` directo (create/cancel booking, portal accept/reject quote, next_*_number, etc.) — muchos usan la respuesta como paso previo (no un simple query), migrar caso a caso.
- Nuevos schemas comunes en `src/lib/schemas/common.ts`: `rfcPublicoGeneral`, `addressSchema`, `notesSchema`, `phoneSchema` (~22 LOC).
- Coerción numérica manual en editores de líneas → `src/lib/coerce.ts` (~12 LOC).

Ahorro restante estimado: **~55 LOC**.


### Lote 3 — Componentes UI (no iniciado, el último por diseño)
- Reports charts (Revenue, MaintenanceCost, Utilization, CashFlow) → `ReportChartCard` (~55 LOC).
- `AuditDiffTables` → `DataTableV2` (~40 LOC).
- `SupplierBillDetailSheet`: extraer `Row` local a `DetailRow` + hook `useDialogs` para 4 diálogos (~30 LOC).
- `ContractDetail` / `ContractDetailsCard` → `DetailRow` (~30 LOC).
- `RegisterSupplierPaymentDialog` → `FileField` wrapper (~8 LOC).
- Nuevo helper `useDialogs` (multi-dialog state).

Ahorro estimado: **~190 LOC**.

## Recuento

| Bloque | LOC pendientes |
| --- | --- |
| Lote 1 (edge functions restantes) | ~200-250 |
| Lote 2 (hooks cola) | ~60-80 |
| Lote 4 (utils/schemas) | ~95 |
| Lote 3 (UI) | ~190 |
| **Total pendiente** | **~545-615 LOC** |

Ya se han eliminado del orden de **~750-830 LOC** de los ~1,380 estimados iniciales.

## Próximo paso propuesto

**Cerrar Lote 1** creando `_shared/facturapi.ts` + `_shared/cfdi.ts` y migrando las funciones que aún declaran su propio boilerplate Facturapi/XML — es el mayor ahorro restante por archivo y desbloquea limpiar los `new Response(JSON.stringify(...))` que quedan.

¿Continuamos con ese cierre de Lote 1, o prefieres saltar directo a Lote 4 (utils/schemas, más rápido) o Lote 3 (UI, más visible)?
