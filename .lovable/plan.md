# Cierre de hallazgos F1–F5

## Verificación de cada hallazgo

**F1 — índice en `documents.uploaded_by`**: correcto, no aplica. El índice parcial `idx_documents_uploaded_by` ya existe en la migración BL-35. Sin cambios.

**F2 — borrar `.env`**: no se aplica. En este proyecto el archivo `.env` es generado y administrado automáticamente por el backend de Lovable Cloud (contiene solo el URL público y la llave publicable, que no son secretos). Borrarlo rompe el arranque de la app y se regenera igual. `.gitignore` ya lo cubre para copias locales.

**F3 — `_shared/webhookIdempotency.ts` sin consumidores**: confirmado. El único import es su propio test. Se eliminan ambos archivos.

**F4 — flujo de caja excluye documentos en silencio**: confirmado. La consulta filtra `.not("due_date","is",null)` y `bucketByWeek` descarta lo que cae fuera del horizonte, sin avisar al usuario.

**F5 — importes en conciliación siempre en MXN**: confirmado. `BankLineMatchPanel` (línea 64) y `BankMatchCandidateList` (línea 103) usan `formatCurrency`, que fija MXN, aunque la cuenta puede ser USD.

## Cambios a implementar

1. Eliminar `supabase/functions/_shared/webhookIdempotency.ts` y su test.

2. Flujo de caja: la query devuelve `{ buckets, excludedNoDueDate, excludedOutOfHorizon }`; dos conteos HEAD (facturas y cuentas por pagar activas sin vencimiento) más el conteo derivado de partidas fuera del horizonte. `CashFlowPage` muestra un aviso breve cuando alguno es mayor a cero.

3. Conciliación bancaria: pasar la moneda de la cuenta desde `BankReconciliationPage` → `BankReconciliationWorkspace` → `BankLineMatchPanel` → `BankMatchCandidateList`, y usar `formatCurrencyWithCode` en los dos puntos de formato.

## Detalles técnicos

- Archivos: `src/features/cash-flow/lib/queryKeys.ts`, `src/features/cash-flow/pages/CashFlowPage.tsx`, `src/features/bank-reconciliation/pages/BankReconciliationPage.tsx`, `.../components/BankReconciliationWorkspace.tsx`, `.../BankLineMatchPanel.tsx`, `.../BankMatchCandidateList.tsx`.
- No se toca `bucketByWeek` ni `cashFlowTransformers`, así que sus pruebas quedan intactas.
- Pruebas nuevas: helper puro para contar partidas fuera del horizonte y formateo por moneda en la lista de candidatos.
- Changelog: entrada patch en `public/changelog.json` + `public/changelog/vX.Y.Z.json`, sincronizando `package.json` y `version.json`.
