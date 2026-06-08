# Consolidar matemática de cotizaciones en `invoiceHelpers` + guardrail ESLint

## Objetivo
Eliminar la última fuente de aritmética monetaria cruda en el código: los helpers de líneas de cotización. Y bloquear regresiones futuras con una regla de ESLint.

No se toca `invoiceFormBuilders.ts` (no contiene matemática; solo coerce `Number()` de tasa/tipo de cambio, que no deben pasar por `currency.js`).

---

## Cambio 1 — Generalizar `applyDiscount` en `src/lib/domain/invoiceHelpers.ts`

Hoy `applyDiscount(item: LineItem)` recibe un `LineItem` completo. Lo convertimos en pieza reutilizable:

```ts
export function applyDiscountToBase(
  base: number,
  discount?: number,
  type?: "%" | "$"
): number { /* currency.js, mismo algoritmo */ }

export function applyDiscount(item: LineItem): number {
  return applyDiscountToBase(item.total || 0, item.discount, item.discount_type);
}
```

`computeTotals` y todo lo demás siguen funcionando igual (wrapper compatible).

## Cambio 2 — Nuevo helper `saleLineTotal`

```ts
export interface SaleLineInput {
  quantity: number;
  unit_price: number;
  discount?: number;
  discount_type?: "%" | "$";
}

export function saleLineTotal(line: SaleLineInput): number {
  const base = lineItemTotal(line.quantity, line.unit_price);
  return applyDiscountToBase(base, line.discount, line.discount_type);
}
```

## Cambio 3 — Reescribir helpers de cotización como wrappers delgados

`src/features/quotes/components/quotes/saleLineHelpers.ts`:
```ts
import { saleLineTotal } from "@/lib/domain/invoiceHelpers";
import type { SaleLine } from "./SaleLineItems";

export function computeSaleLineTotal(line: SaleLine): number {
  return saleLineTotal({
    quantity: line.quantity,
    unit_price: line.unitPrice,
    discount: line.discount,
    discount_type: line.discountType,
  });
}
```

`src/features/quotes/components/quotes/rentalLineHelpers.ts`:
```ts
import { calculateRentalCost, applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";

export function computeRentalLineTotal(line: RentalLine, startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 0;
  const items = calculateRentalCost(line.dailyRate, line.weeklyRate, line.monthlyRate, startDate, endDate);
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const base = lineItemTotal(line.quantity, subtotal); // currency.js
  return applyDiscountToBase(base, line.discount, line.discountType);
}
```

Ningún `*`, `-` ni `1 - x/100` crudo fuera de `invoiceHelpers.ts`.

## Cambio 4 — Tests

Ampliar `src/features/quotes/components/quotes/__tests__/lineHelpers.test.ts` y/o agregar a `src/lib/domain/__tests__/invoiceHelpers.test.ts`:

- `saleLineTotal({ qty: 3, unit_price: 19.99 })` → `59.97` (sin drift)
- `saleLineTotal` con descuento 10% sobre 19.99 → `17.99`
- `applyDiscountToBase(0.1 + 0.2, 0)` → `0.3`
- `computeRentalLineTotal` con `quantity: 3` y tarifa diaria 19.99 × N días → exacto a 2 decimales
- Descuento `$` mayor que base → `0` (no negativo)

## Cambio 5 — Guardrail ESLint

En `eslint.config.js`, agregar un bloque overrride para los archivos de helpers de feature:

```js
{
  files: [
    "src/features/quotes/components/quotes/*LineHelpers.ts",
    "src/features/invoices/hooks/invoiceForm/*.ts",
  ],
  rules: {
    "no-restricted-syntax": ["error", {
      selector: "BinaryExpression[operator=/^[*/]$/]",
      message: "Aritmética monetaria prohibida fuera de src/lib/domain/invoiceHelpers.ts. Usar lineItemTotal/applyDiscountToBase/saleLineTotal.",
    }],
  },
},
```

Alcance limitado a propósito: no se aplica a `invoiceHelpers.ts` (donde vive la fuente de verdad), ni a `useInvoiceFormTotals/Submit/LineItemHandlers` (que ya delegan), ni a coerce/rates donde `*` es legítimo. Solo bloquea reintroducción en helpers de líneas.

## Cambio 6 — Changelog

Agregar `public/changelog/v6.24.7.json` (patch, refactor) + entrada en `public/changelog.json`:
- "Helpers de líneas de cotización delegan en `invoiceHelpers` (currency.js)"
- "Nuevo `saleLineTotal` y `applyDiscountToBase` reutilizables"
- "Regla ESLint bloquea aritmética monetaria cruda en helpers de líneas"

---

## Archivos tocados
- `src/lib/domain/invoiceHelpers.ts` (agregar `applyDiscountToBase`, `saleLineTotal`)
- `src/features/quotes/components/quotes/saleLineHelpers.ts` (wrapper)
- `src/features/quotes/components/quotes/rentalLineHelpers.ts` (wrapper)
- `src/lib/domain/__tests__/invoiceHelpers.test.ts` o `lineHelpers.test.ts` (nuevos casos)
- `eslint.config.js` (override `no-restricted-syntax`)
- `public/changelog.json` + `public/changelog/v6.24.7.json`

## Lo que NO se toca
- `invoiceFormBuilders.ts` — sin matemática, solo coerce.
- `useInvoiceFormTotals/Submit/LineItemHandlers` — ya delegan en `invoiceHelpers`.
- `invoiceHelpers.ts` `applyDiscount` original — se mantiene como wrapper para no romper callers existentes.

## Riesgos
- Bajo. Los wrappers preservan firmas públicas. Cobertura de tests existente para `computeRentalLineTotal`/`computeSaleLineTotal` valida equivalencia funcional; los nuevos tests cierran los casos de drift.
- La regla ESLint podría disparar en algún `* `/`/` legítimo del archivo (p.ej. dividir por 100 una tasa). Si pasa, se usa `// eslint-disable-next-line` con justificación o se mueve el cálculo a `invoiceHelpers`.
