

## Corregir desfase de fechas por interpretacion UTC

### Problema
Las fechas se guardan correctamente en la base de datos (2025-10-20 y 2025-11-20), pero al mostrarlas o restaurarlas en el formulario, aparecen un dia antes. Esto ocurre porque `new Date("2025-10-20")` interpreta la cadena como medianoche UTC, y al convertirla a hora local de Mexico (UTC-6), retrocede al dia anterior.

### Causa raiz
Dos puntos del codigo usan `new Date(dateStr)` con cadenas "YYYY-MM-DD":

1. **`formatDateDisplay`** en `src/lib/utils.ts` (linea 12): usado para mostrar fechas en QuoteDetail y otras paginas de detalle.
2. **QuoteForm useEffect** (linea 57): al restaurar fechas de una cotizacion existente para edicion.

### Solucion
Crear una funcion auxiliar `parseDateLocal` que interprete cadenas "YYYY-MM-DD" como fecha local (no UTC), y usarla en todos los puntos afectados.

### Cambios

**1. `src/lib/utils.ts`**
- Agregar funcion `parseDateLocal(dateStr)` que divide la cadena y construye `new Date(year, month - 1, day)` en tiempo local.
- Actualizar `formatDateDisplay` para usar `parseDateLocal` en vez de `new Date(dateStr)`.

**2. `src/pages/QuoteForm.tsx`**
- En el useEffect que restaura `existingQuote`, reemplazar `new Date(existingQuote.start_date)` y `new Date(existingQuote.end_date)` por `parseDateLocal(...)`.
- Aplicar lo mismo para `valid_until`.

**3. Buscar y corregir otros usos de `new Date(dateString)` con fechas "YYYY-MM-DD"**
- Revisar `BookingForm`, `InvoiceForm`, `ContractForm`, `RentalFinancialSummary` y cualquier otro lugar donde se parseen fechas de la base de datos.

**4. `src/test/invoiceUtils.test.ts`**
- Agregar un test que verifique que `parseDateLocal("2025-10-20")` retorna el dia 20 y no el 19, confirmando que no hay desfase UTC.

