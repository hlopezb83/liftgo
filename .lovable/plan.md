

## Agregar soporte multi-moneda a Cotizaciones

Actualmente el sistema solo maneja MXN de forma global. Para permitir cotizaciones en USD (u otras monedas a futuro), se necesitan los siguientes cambios:

### Alcance

Agregar un selector de moneda (MXN / USD) en el formulario de cotización. La moneda seleccionada se guarda en la base de datos y se usa para mostrar los montos correctamente en la interfaz y en el PDF generado.

### Cambios

**1. Base de datos** -- migración SQL
- Agregar columna `currency TEXT NOT NULL DEFAULT 'MXN'` a la tabla `quotes`.

**2. `src/lib/config.ts`**
- Agregar constante `CURRENCY_OPTIONS` con las opciones disponibles: `[{ value: "MXN", label: "MXN (Peso Mexicano)" }, { value: "USD", label: "USD (Dólar)" }]`.

**3. `src/lib/formatCurrency.ts`**
- Agregar función `formatCurrencyWithCode(amount, currencyCode)` que reciba el código de moneda como parámetro en lugar de usar siempre MXN.

**4. `src/hooks/useQuoteFormLogic.ts`**
- Agregar estado `currency` (default `"MXN"`).
- Restaurar valor desde `existingQuote.currency` al editar.
- Incluir `currency` en el payload de creación/actualización.
- Exponer `currency` y `setCurrency` en el return.

**5. `src/pages/QuoteForm.tsx`**
- Agregar selector de moneda (MXN / USD) dentro de la card "Detalles de Cotización", junto al selector de IVA.

**6. `src/components/CostSummaryCard.tsx`**
- Aceptar prop opcional `currency` y usar `formatCurrencyWithCode` cuando se proporcione.

**7. `src/lib/quotePdfPremium.ts`**
- Recibir `currency` como parámetro y usar `formatCurrencyWithCode` en lugar de `formatCurrency` para mostrar la moneda correcta en el PDF.
- Cambiar el texto hardcodeado `"MXN"` en el total por la moneda dinámica.

**8. `src/components/quotes/QuotePDFButton.tsx`**
- Pasar `quote.currency` al generador de PDF.

**9. `src/pages/QuoteDetail.tsx`**
- Mostrar la moneda seleccionada en la vista de detalle.

### Archivos afectados
- 1 migración SQL (nueva columna)
- `src/lib/config.ts`
- `src/lib/formatCurrency.ts`
- `src/hooks/useQuoteFormLogic.ts`
- `src/pages/QuoteForm.tsx`
- `src/components/CostSummaryCard.tsx`
- `src/lib/quotePdfPremium.ts`
- `src/components/quotes/QuotePDFButton.tsx`
- `src/pages/QuoteDetail.tsx`

