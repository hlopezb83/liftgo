## Objetivo
Eliminar colas binarias (`.000000004`) en valores monetarios calculados antes de persistir a DB y antes de agregar en reportes, mediante un helper centralizado.

## Alcance
Completo: helper + boundaries de escritura + agregaciones de reportes. NO se toca `formatCurrency.ts` (Intl ya redondea para mostrar).

## Cambios

### 1. Nuevo helper `src/lib/money.ts`
```ts
export const roundMoney = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export const sumMoney = (values: number[]): number =>
  roundMoney(values.reduce((acc, v) => acc + (v || 0), 0));
```
Más test unitario `src/lib/__tests__/money.test.ts` cubriendo: `0.1+0.2`, negativos, cero, arrays grandes, NaN/undefined guard.

### 2. Boundaries de escritura (aplicar `roundMoney` justo antes del insert/update)
- `src/features/quotes/hooks/quoteForm/quoteFormPayload.ts` — `subtotal`, `tax_amount`, `total`, `line_items[].amount`.
- `src/features/invoicing/` — utilidades que arman payloads de `invoices` y `credit_notes` (totales, IVA, retenciones).
- `src/features/payments/` — cálculo de `amount`, balance restante en `PaymentForm`.
- `src/features/bookings/` — `total_amount`, `daily_rate`, `monthly_rate` derivados.
- `src/features/contracts/` — `deposit_amount`, tarifas calculadas.

### 3. Agregaciones de reportes
- `src/features/reports/` — P&L: `roundMoney` al cierre de cada fila (gross margin, operating profit, net) y subtotales por categoría.
- `src/features/reports/mrr/` — MRR total y por segmento.
- `src/lib/pdf/documents/CustomerStatementDocument.tsx` — `totalInvoiced`, `totalPaid`, `balance` (usar `sumMoney`).
- `src/features/dashboard/` — KPIs derivados de sumas.

### 4. NO tocar
- `src/lib/formatCurrency.ts` — Intl ya redondea con `maximumFractionDigits: 2`.
- PDFs que solo leen valores ya persistidos (LineItemsTable, TotalsBox).
- Cálculos en RPCs/Postgres (numeric nativo no tiene este problema).

### 5. Changelog
Patch `v6.22.9`: helper `roundMoney` + adopción en escritura y reportes.

## Riesgos
- Bajo. El redondeo a 2 decimales en boundaries es idempotente y consistente con cómo Postgres `numeric(12,2)` almacena los valores.
- Tests de quotes/invoicing existentes deben seguir pasando (los expected values ya están a 2 decimales).

## Verificación
- Correr `bunx vitest run src/lib/__tests__/money.test.ts src/features/quotes src/features/invoicing`.
- Revisar payload de un quote nuevo en consola para confirmar valores limpios.