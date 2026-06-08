# Consolidación de lógica financiera de facturas

## Hallazgo previo (importante)

Antes de planear, revisé `invoiceFormBuilders.ts` y **no contiene lógica financiera ni de impuestos/descuentos**. Solo contiene builders de prefill de formulario (`cfdiFromCustomer`, `buildFromInvoice`, `buildFromQuote`, `enrichLineItem`) que mapean datos de cliente/cotización/factura existente a `InvoiceFormValues`. Mover eso a `invoiceHelpers.ts` mezclaría dos dominios (prefill de UI vs. matemática financiera) y rompería la convención de que `lib/domain/` no dependa de schemas de formularios.

La lógica financiera real ya está en `src/lib/domain/invoiceHelpers.ts`, envuelta con `currency.js`:
- `applyDiscount()` — descuentos `$` y `%`
- `computeTotals()` — subtotal + IVA + total
- `calculateRentalCost()`, `generateLineItems()`, `generateLineItemsFromModel()` — generación de líneas
- Wrapper interno `money()` con precisión 2.

## El gap real

Hay **un único punto** donde el cálculo financiero ocurre fuera de `invoiceHelpers.ts`:

`src/features/invoices/hooks/invoiceForm/useInvoiceLineItemHandlers.ts:19`

```ts
next.total = currency(Number(next.unit_price)).multiply(Number(next.quantity)).value;
```

Importa `currency.js` directamente y recalcula el total de línea al editar `quantity`/`unit_price`. Esa es la única fuga.

## Cambios propuestos

1. **Añadir `lineItemTotal(quantity, unitPrice)` en `src/lib/domain/invoiceHelpers.ts`** — wrapper sobre `money()` que devuelve el total de una línea redondeado a 2 decimales. Exportarlo.

2. **`useInvoiceLineItemHandlers.ts`**:
   - Eliminar `import currency from "currency.js"`.
   - Reemplazar la línea del cálculo por `lineItemTotal(next.quantity, next.unit_price)` importado desde `@/lib/domain/invoiceHelpers`.

3. **Test unitario** en `src/lib/domain/__tests__/invoiceHelpers.more.test.ts`:
   - `lineItemTotal(3, 100.10)` → `300.3` (precisión binaria correcta).
   - `lineItemTotal(0, 50)` → `0`.
   - `lineItemTotal(NaN, 10)` → `0` (defensive).

4. **Dejar `invoiceFormBuilders.ts` intacto** — no contiene matemática financiera, solo mapeo de datos para prefill. Moverlo sería un refactor de UI/form, no de "single source of truth financiero".

5. **Changelog `v6.24.1` (patch, refactor)** documentando la consolidación y el invariante: "todo cálculo de subtotal, IVA, descuento y total de línea pasa exclusivamente por `src/lib/domain/invoiceHelpers.ts`".

## Verificación

- Buscar en todo el repo `import currency from "currency.js"` fuera de `src/lib/` y confirmar que tras este cambio solo queda en `invoiceHelpers.ts` (y, si los hay, otros dominios legítimos como `quoteHelpers`).
- Correr `bun test` para asegurar que los tests existentes de `invoiceHelpers` y `useInvoiceLineItemHandlers` siguen verdes.
- Verificar tipado estricto: sin `as`, sin `!`.

## Fuera de alcance (intencionalmente)

- No se tocan `invoiceFormBuilders.ts`, `useInvoiceFormHandlers.ts`, `useInvoicePrefill.ts`, `useInvoiceFormSubmit.ts` — su responsabilidad es prefill/persistencia, no cálculo financiero.
- No se mezclan helpers de cotizaciones (`features/quotes/lib/`) en este lote.

## Pregunta de confirmación

¿Confirmas este alcance acotado, o realmente quieres que mueva también los builders de prefill (`buildFromInvoice`, `buildFromQuote`, etc.) a `lib/domain/` aun cuando dependerían del schema de formularios? Recomiendo mantenerlos donde están.
