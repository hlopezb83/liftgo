
# Cambiar prefijos de folios a espanol

## Resumen

Actualmente los folios de documentos usan prefijos en ingles. Se propone cambiarlos a espanol:

| Documento | Prefijo actual | Nuevo prefijo |
|-----------|---------------|---------------|
| Facturas | INV- | FAC- |
| Cotizaciones | QUO- | COT- |
| Contratos | CTR- | CTR- (sin cambio, ya es valido) |

## Cambios necesarios

### 1. Migracion de base de datos (3 funciones SQL)

Actualizar las funciones RPC que generan los numeros:

- **`next_invoice_number()`** -- cambiar prefijo de `'INV-'` a `'FAC-'`
- **`next_quote_number()`** -- cambiar prefijo de `'QUO-'` a `'COT-'`
- `next_contract_number()` no requiere cambio

Las funciones usaran `regexp_replace` para extraer la parte numerica, por lo que seguiran funcionando correctamente con registros existentes que tengan el prefijo anterior.

### 2. Codigo frontend (2 archivos)

- **`src/pages/QuoteForm.tsx`** -- cambiar el fallback `"QUO-0001"` a `"COT-0001"`
- **`supabase/functions/generate-recurring-invoices/index.ts`** -- cambiar el fallback `` `INV-AUTO-${Date.now()}` `` a `` `FAC-AUTO-${Date.now()}` ``

### 3. Tests (2 archivos)

- **`src/test/invoiceFlow.test.ts`** -- actualizar `"FAC-0042"` (ya esta correcto)
- **`src/pages/__tests__/InvoicesPage.test.tsx`** -- cambiar `"INV-0001"` / `"INV-0002"` a `"FAC-0001"` / `"FAC-0002"` y las aserciones correspondientes

### Nota

Los registros existentes con prefijos antiguos seguiran siendo validos y visibles. Solo los nuevos registros usaran los nuevos prefijos.
