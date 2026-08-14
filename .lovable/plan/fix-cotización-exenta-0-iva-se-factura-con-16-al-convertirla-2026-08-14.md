# Fix: cotización exenta (0% IVA) se factura con 16% al convertirla

## Contexto

`src/features/invoices/hooks/invoiceForm/invoiceFormBuilders.ts:134` — `buildFromQuote`:
```ts
taxRate: Number(q.tax_rate) || 16,
```
`Number(0) || 16` evalúa a `16` porque `0` es *falsy*. Una cotización con `tax_rate = 0`
(cliente exento / régimen sin IVA) se convierte a factura con 16% de IVA, inflando el total
y generando un CFDI incorrecto.

**Verificación del bug:**
- `quotes.tax_rate` es `numeric NOT NULL DEFAULT 0` (acepta 0).
- El formulario de cotización valida `taxRate` con regex `/^\d+(\.\d+)?$/` que permite `"0"`.
- `quoteFormPayload.ts:68` guarda `tax_rate: Number(a.taxRate)` → persiste `0`.
- `buildFromInvoice` (línea 102) usa `Number(inv.tax_rate) || 0` → ahí 0 se preserva
  correctamente; solo la ruta cotización→factura fuerza 16.
- No existen pruebas de regresión para `buildFromQuote` (el test actual solo cubre
  `cfdiFromCustomer`).

## Cambios

1. **`src/features/invoices/hooks/invoiceForm/invoiceFormBuilders.ts:134`**
   ```ts
   // antes
   taxRate: Number(q.tax_rate) || 16,
   // después
   taxRate: q.tax_rate == null ? 16 : Number(q.tax_rate),
   ```
   - Preserva `0` (exento) cuando la cotización lo trae explícito.
   - Solo cae al default `16` cuando `tax_rate` es `null`/`undefined` (no ocurre desde la
     BD, pero protege mocks/tests). El `16` como *fallback* es el IVA estándar mexicano y
     coincide con el default del formulario de cotización (`taxRate: "16"`).

2. **`src/features/invoices/hooks/invoiceForm/__tests__/invoiceFormBuilders.test.ts`**
   Añadir suite para `buildFromQuote` (actualmente sin cobertura) con casos:
   - `tax_rate = 0` → `taxRate === 0` (exento preservado) — caso de regresión del bug.
   - `tax_rate = 8` → `taxRate === 8`.
   - `tax_rate = 16` → `taxRate === 16`.
   - `tax_rate = null/undefined` → `taxRate === 16` (default seguro).
   - Verifica que `currency`, `customerId` y `lineItems` se heredan correctamente.

3. **Versionado y changelog**
   - `package.json` → `7.320.7` (patch: corrección de bug de cálculo).
   - `public/changelog.json` → entrada nueva al inicio con título y descripción.
   - Regenerar `public/version.json` con `node scripts/gen-version.mjs`.

## Fuera de alcance

- `buildFromInvoice:102` (`Number(inv.tax_rate) || 0`): NO se toca; ahí el *fallback* es `0`
  y `0 || 0 === 0`, por lo que el 0 exento ya se preserva. Sin bug.
- `cfdiFromInvoice:57` (`Number(inv.tipo_cambio) || 1`): NO se toca; un tipo de cambio de 0
  es fiscalmente inválido, así que el *fallback* a 1 es aceptable.
- No se cambia lógica de negocio ni de timbrado; solo el valor inicial del formulario al
  pre-llenar desde cotización. El usuario puede editarlo antes de timbrar.

## Verificación

- `tsgo` (typecheck) sin errores.
- `bunx vitest run src/features/invoices/hooks/invoiceForm` verde (tests nuevos + existentes).
- ESLint 0 warnings.
