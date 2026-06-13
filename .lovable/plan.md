## Lote 2 — Coverage real de dominio puro

Objetivo: subir cobertura efectiva con tests rápidos y deterministas sobre lógica pura, antes de mover los thresholds. Sin tocar producción.

### Estado base (medido)
- Thresholds Vitest actuales: `lines:11 / branches:10 / functions:8 / statements:11` con margen real ≈ 0.5pp.
- `rentalCalculation.ts` (116 LOC): sin tests.
- `invoiceTotals.ts` (75 LOC): sin tests directos.
- `syncInvoiceStatus.ts` (62 LOC): solo testeado indirectamente vía `paymentFlow.test.ts`.
- PDFs (`ContractDocument`, `CustomerStatementDocument`, `IncomeStatementDocument`, `InvoiceDocument`, `QuoteDocument`): 0% — 5 documentos, 634 LOC sumados.

### Cambios

**1. `src/lib/domain/__tests__/rentalCalculation.test.ts` (nuevo)**
Función `calculateRentalCost` con tarifas día/semana/mes — escenarios:
- Solo mensual: 1, 2, 3 meses exactos.
- Mensual + semanal: 1 mes + 2 semanas.
- Mensual + semanal + diario: 1 mes + 2 semanas + 3 días.
- Solo semanal: 21 días → 3 semanas.
- Fallback de diario desde semanal (`d=0, w>0`) y desde mensual (`d=0, w=0, m>0`).
- Edge: `start === end` (1 día), tarifas en cero, fechas inválidas → 0 items o resultados acotados.
- `generateLineItems` y `generateLineItemsFromModel`: descripción incluye nombre del modelo y `(xN)`.

**2. `src/lib/domain/__tests__/invoiceTotals.test.ts` (nuevo)**
- `lineItemTotal`: NaN, `null`, `undefined`, negativos.
- `applyDiscountToBase`: % normal, $ fijo, descuento > base (no negativo), descuento 0/null.
- `saleLineTotal`: combinaciones cantidad × precio − descuento.
- `computeTotals`: IVA 16/8/0, subtotales con descuentos por línea, líneas vacías.

**3. `src/features/invoices/lib/__tests__/syncInvoiceStatus.test.ts` (nuevo)**
Mock de `@/integrations/supabase/client` con builder fluido en memoria:
- 0 pagos → status `sent`.
- Pagos < total → `partial`.
- Pagos == total → `paid` con `paid_at` = mayor `payment_date`.
- Pagos == total y `payment_date` ausente → fallback recibido.
- Invoice no existe → no lanza.
- Idempotencia: si ya está en el status correcto no hace UPDATE.

**4. PDFs: smoke + snapshot estructural en `src/lib/pdf/documents/__tests__/`**
Patrón único, un test por documento (5 archivos). Cada test:
- Importa `pdf` de `@react-pdf/renderer` y renderiza con fixture mínima.
- Asserts: `await pdf(<Doc {...fixture}/>).toBuffer()` produce `Buffer.length > 1000`, no lanza, y `toString().slice(0, 8) === "%PDF-1."`.
- Snapshot inline del árbol React (no del PDF binario) vía `renderer.create(...).toJSON()` para detectar regresiones estructurales.

Fixtures comparten un módulo `src/lib/pdf/documents/__tests__/__fixtures__/pdfFixtures.ts` con `company`, `lineItems`, `customer`, `totals`.

**5. Subir thresholds en `vitest.config.ts`**
Tras correr local con `--coverage` y medir el nuevo baseline, ajustar dejando ≥5pp de margen real. Estimado conservador:
- `lines: 16`, `branches: 14`, `functions: 12`, `statements: 16`.
- Valores finales = `medido_local − 5pp` redondeado a entero.

### Detalles técnicos

- `@react-pdf/renderer` requiere `process.stdout` en node; el setup actual (`jsdom`) lo soporta. Verificar con un primer test antes de extender a los 5.
- Para el mock de Supabase en `syncInvoiceStatus`, reusar el patrón de `paymentFlow.test.ts` (chain `from().select().eq().single()`) — crear helper `createSupabaseMock({ payments, invoice })` local al test.
- Sin cambios en código de producción. Si un test descubre un bug, se reporta como hallazgo separado (no se arregla en este lote).
- Si `@react-pdf/renderer` no rinde bien en jsdom, fallback: `vi.mock('@react-pdf/renderer')` y solo testear que el componente se construye sin lanzar y exporta las props esperadas — pierde detección de regresiones reales pero conserva señal mínima.

### Entregables

- 8 archivos de test nuevos (3 unitarios + 5 PDF) + 1 fixture compartido.
- `vitest.config.ts` con thresholds actualizados.
- Entrada `v6.61.0` en `public/changelog.json` + `public/changelog/v6.61.0.json`.

### Verificación

- `bun run test --coverage` local: 526 + ~80 tests nuevos, thresholds nuevos pasan con margen ≥5pp.
- `bunx tsc --noEmit -p tsconfig.app.json` limpio.
- `bunx knip` sin nuevos warnings.
- Pipeline CI verde al re-lanzar el workflow.

¿Confirmas que avance con esta ejecución?