# Refactor a currency.js para cálculos financieros

## Hallazgos de exploración

1. **`currency.js` no está instalado.** Hay que agregarlo (`bun add currency.js`).
2. **No existe lógica de conversión USD → MXN en el código.** Busqué `exchange_rate` / `exchangeRate` / `USD→MXN` y no hay nada. Las cotizaciones soportan multi-moneda solo a nivel de etiqueta (MXN/USD), no se hace conversión aritmética. → **Aclaración abajo.**
3. La aritmética financiera real vive en pocos archivos. El resto de los hits de `toFixed` / `Math.round` son **formato de presentación** (PDFs, tablas, KPIs) o **horómetro** (no dinero) y NO deben migrarse.

## Archivos a refactorizar

### 1. `src/lib/domain/invoiceHelpers.ts` (núcleo)
Único archivo con aritmética monetaria real. Firmas se preservan idénticas.

- **`applyDiscount(item)`** → reemplazar `base - item.discount`, `base * (1 - item.discount/100)` por `currency(base).subtract(item.discount).value` y `currency(base).multiply(1 - item.discount/100).value`. Mantener `Math.max(0, …)` (no es redondeo, es clamp).
- **`buildDailyRemainder`** → eliminar `Math.round(... * 100)/100`. Usar `currency(weeklyRate).divide(7)`, `currency(monthlyRate).divide(30)`, `currency(remaining).multiply(fallback).value`.
- **`calculateRentalCost`** → reemplazar `months * m`, `weeks * w`, `remaining * dailyRate` con `currency(m).multiply(months).value`, etc.
- **`generateLineItemsFromModel`** → reemplazar `item.unit_price * quantity`, `item.total * quantity` con `currency(...).multiply(quantity).value`.
- **`computeTotals(lineItems, taxRate)`** → reemplazar `reduce((sum, item) => sum + applyDiscount(item), 0)` por `currency` acumulador; `subtotal * (taxRate/100)` por `currency(subtotal).multiply(taxRate).divide(100).value`; `subtotal + taxAmount` por `currency(subtotal).add(taxAmount).value`. **Eliminar los `Math.round(...*100)/100`.**

Configuración: usar `currency(x, { precision: 2 })` por defecto en MXN. Devolver siempre `.value` (number) para no romper consumidores.

### 2. `src/features/invoices/hooks/invoiceForm/useInvoiceLineItemHandlers.ts`
- Línea 17: `Math.round(Number(qty) * Number(unit_price) * 100) / 100` → `currency(unit_price).multiply(qty).value`. Firma del handler intacta.

## Archivos NO migrados (justificación)

| Archivo | Motivo |
|---|---|
| `useBookingHourometer.ts`, `deliveryDetailHelpers.ts` | Calculan **horas de horómetro**, no dinero. `Math.round(x*10)/10` es redondeo a décima de hora, no precisión monetaria. |
| `statementRowFactories.ts`, `pdf/incomeStatement/rows.ts` | Usan `.toFixed()` solo para **renderizado de texto** (PDF / tabla). No hay aritmética; sustituirlo no aporta precisión. |
| `formatCurrency.ts` | Solo formateo `Intl.NumberFormat`. Ya correcto. |
| `CalendarStatCards.tsx`, `ActivityKPIs.tsx`, `useCRMMetrics.ts`, `UtilizationReport.tsx`, etc. | Cálculos de **porcentajes / utilización / conteos**, no de moneda. |

## Pasos de ejecución

1. `bun add currency.js`
2. Refactor `src/lib/domain/invoiceHelpers.ts` (5 funciones internas, firmas públicas idénticas).
3. Refactor `src/features/invoices/hooks/invoiceForm/useInvoiceLineItemHandlers.ts` (1 línea).
4. Validar con `src/test/invoiceHelpers.test.ts` existente; agregar 2-3 casos de borde de floating-point clásicos (`0.1 + 0.2`, `19.99 * 0.16`, división de tarifa semanal).
5. Entrada en `public/changelog.json` + `public/changelog/v6.5.0-alpha.8.json` (patch, categoría refactor).

## Aclaración pendiente

**Conversión USD → MXN no existe hoy en el código.** Opciones:
- **(A)** Ejecutar solo lo anterior (núcleo de invoices/rentas). Recomendado: alineado al directorio actual.
- **(B)** Además, crear `src/lib/fx.ts` con `convertUsdToMxn(amount, rate)` basado en currency.js, listo para integrarse cuando se añada el campo `exchange_rate`. Útil como infraestructura, pero sin consumidores hoy.

Si no respondes, asumo **(A)**.
