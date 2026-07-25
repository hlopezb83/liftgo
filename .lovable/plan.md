## Contexto

CI en rojo por un solo test unitario (los demás jobs verdes; el E2E de shard 1 mostró un fallo transitorio en `invoice-payment.spec.ts` que pasó en el retry #1 y el shard reporta 0 failed).

## Causa raíz

En **v7.229.0 (R15 F-01)** movimos la validación `.min(1, "Selecciona un cliente")` de `customerName` a `customerId` en `invoiceFormSchema`. `buildEmptyInvoiceValues()` devuelve `customerId: ""`, por lo que ahora cualquier payload que parta de él sin sobrescribir `customerId` falla.

El test `src/features/invoices/lib/__tests__/invoiceFormSchema.test.ts:100` — *"acepta payload con al menos una partida válida"* — arma el payload como `{ ...buildEmptyInvoiceValues(), lineItems: [...] }` sin `customerId`, y ahora ese caso legítimamente falla con "Selecciona un cliente".

## Fix (v7.229.2, patch)

1. **`src/features/invoices/lib/__tests__/invoiceFormSchema.test.ts`**
   - En el test *"acepta payload con al menos una partida válida"* (línea 100-107), pasar un `customerId` no vacío (ej: `customerId: "cust-1"`) en el spread para que refleje el contrato post-R15.
   - Opcionalmente añadir un test explícito nuevo *"rechaza payload sin customerId"* que documente la invariante F-01 (el test de `buildEmptyInvoiceValues` ya la cubre indirectamente, así que este es opcional).

2. **Changelog**
   - Nueva entrada `public/changelog/v7.229.2.json` (type: `patch`, category: `fix`) explicando el ajuste del test al nuevo contrato de `customerId` de R15 F-01.
   - Bump en `public/changelog.json` y `package.json` a `7.229.2`.

## Fuera de alcance (no bloquean CI)

- **ESLint "Cannot access refs during render"**: 4 warnings en `InvoiceForm.tsx` por el `justSavedRef.current` de R15 F-03 leído durante el render del `<Prompt>`. Son warnings, no rompen CI. Si se quiere limpiar en un lote posterior, se lee el ref dentro de un handler o se convierte a `useState` — pero cambia el timing del guard y hay riesgo de regresar F-03.
- **E2E `invoice-payment.spec.ts`**: flake que pasó en retry (shard 1 reporta 0 failed, no bloqueó el job).
- **Cache saves fallidos**: colisiones benignas de `actions/cache` entre shards concurrentes, no rompen los jobs.

## Verificación

- `bunx vitest run src/features/invoices/lib/__tests__/invoiceFormSchema.test.ts` → 14/14.
- Suite completa `bunx vitest run` → 1250/1250.