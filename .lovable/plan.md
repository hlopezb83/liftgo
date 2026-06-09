# Endurecimiento PR 5 + PR 7

Objetivo: cerrar deuda técnica de las dos features de CxP/Tesorería antes de seguir construyendo encima. Sin features nuevas — solo tests, validaciones y pulido UI.

---

## Parte A — PR 5: Complemento de Pago (REP) CFDI

### A1. Tests del trigger `set_supplier_payment_rep_required`
Archivo nuevo: `supabase/migrations/_tests/` no aplica — se añade test SQL via test edge function o test Vitest contra DB de pruebas. Camino elegido: **test Vitest** en `src/test/supplierRepTrigger.test.ts` con mocks de Supabase, validando la lógica equivalente del trigger (factura PPD + monto > 0 ⇒ `rep_required=true`; PUE ⇒ `false`; cancelación ⇒ reset).

### A2. Tests de la edge function `validate-supplier-rep`
Archivo nuevo: `supabase/functions/validate-supplier-rep/index_test.ts` siguiendo convención Deno (ver `stamp-cfdi/index_test.ts`). Casos:
- XML no tipo "P" → 400
- RFC emisor no coincide con proveedor → 400
- UUID factura no referenciado → 400
- Monto no coincide (tolerancia 0.01) → 400
- UUID REP duplicado en otro pago → 409
- Caso feliz → 200 + upload XML

### A3. Backfill PPD históricos sin REP
Migración nueva que recorre `supplier_payments` ligados a `supplier_bills` con `payment_method_sat='PPD'` donde `rep_required` esté en `false`/`null` y lo marca como `true` con `rep_status='pending'`. Se ejecuta una sola vez vía migration con `WHERE` defensivo (no toca pagos ya `received` o `not_applicable`).

### A4. Refinamiento UI del badge REP
- `SupplierPaymentRepBadge.tsx` (o equivalente actual): tooltip con fecha de carga (`rep_received_at`) y UUID truncado.
- Botón "Descargar XML/PDF" cuando `rep_status='received'` usando signed URL del bucket `cfdi-files`.
- Color del badge: `received` verde, `pending` ámbar, `rejected` rojo, `not_applicable` neutro.

---

## Parte B — PR 7: Conciliación bancaria

### B1. Tests de matching scoring
Archivo nuevo: `src/features/bank-reconciliation/lib/__tests__/matchingScore.test.ts` (tests en TS contra una función helper extraída del RPC). Para mantener paridad, se extrae a `matchingScore.ts` la fórmula `score(amount, date, reference)` y se prueba:
- Match exacto: 100
- Mismo monto + fecha exacta + sin ref → 85
- Mismo monto + 3 días + ref parcial → 75-80
- Monto distinto → 0

### B2. Badge "Conciliado el DD/MM" en detalle de payments
- `payments` y `supplier_payments` ya quedan ligados vía `bank_statement_lines.matched_payment_id` / `matched_supplier_payment_id`. Se añade hook `useReconciliationStatus(paymentId)` que consulta la línea conciliada.
- Se renderiza badge en `PaymentDetailDialog.tsx` y `SupplierPaymentDetailSheet.tsx`: "Conciliado el DD/MM/YYYY · Cuenta ABC ····1234".

### B3. Vista de historial de imports
- Nueva ruta `/conciliacion-bancaria/historial` con tabla zebra de `bank_statement_imports` (cuenta, archivo, período, líneas, % conciliado, importado por, fecha).
- Drill-down sheet con líneas del import y opción de eliminar import completo (cascade ya configurado en DB; restringido a Admin).

---

## Sección técnica

**Migraciones (1 sola):**
- Backfill PPD: `UPDATE supplier_payments SET rep_required=true, rep_status='pending' WHERE ...`.

**Archivos nuevos:**
- `src/test/supplierRepTrigger.test.ts`
- `supabase/functions/validate-supplier-rep/index_test.ts`
- `src/features/bank-reconciliation/lib/matchingScore.ts` + `__tests__/matchingScore.test.ts`
- `src/features/bank-reconciliation/hooks/useReconciliationStatus.ts`
- `src/features/bank-reconciliation/hooks/useBankStatementImports.ts`
- `src/features/bank-reconciliation/pages/BankStatementImportsHistoryPage.tsx`
- `src/features/bank-reconciliation/components/ImportHistoryDetailSheet.tsx`
- `public/changelog/v6.33.0.json`

**Archivos editados:**
- Badge REP en componente de detalle de `supplier_payments`
- `PaymentDetailDialog.tsx` (CxC) y detalle de `supplier_payments` (CxP) → badge conciliación
- `src/lib/routes-config.tsx` + `src/layouts/sidebar/navConfig.ts` (sub-ruta historial)
- `public/changelog.json`

**Changelog:** `v6.33.0` (patch — endurecimiento, sin features nuevas user-facing salvo historial).

**Fuera de alcance:**
- Cambios al algoritmo de matching (solo se extrae a función testeable).
- Cancelación / re-envío de REP automatizado.
- Conciliación de tarjetas de crédito.
- Recordatorios de REP pendiente por email (queda para fase de notificaciones).
