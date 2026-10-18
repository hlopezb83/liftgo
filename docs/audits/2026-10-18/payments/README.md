# N7 / N8 — evidencia de pagos

- Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.
- Commit de corrección inicial: `6f0b96d287d8b4d50a5fae8c50e97bf04ee4a8d3`. El ajuste posterior de frontera de centavos N8 queda documentado al final y sustituye la comparación inicial en moneda de pago.
- Rama: `fix/audit-payments-20261018`.
- Entorno: ASUS / Windows PowerShell, Node `v24.19.0`, Vitest `4.1.11`.
- Todas las cantidades y facturas de estas regresiones son **sintéticas**. No se consultaron ni modificaron pagos publicados. Los tests del diálogo simulan `useUpdatePayment`; no prueban aceptación de escrituras por PostgreSQL.

## Cambios revisables

| Hallazgo | Archivo y líneas en el commit corregido | Resultado |
| --- | --- | --- |
| N7 | `src/features/invoices/lib/paymentCurrency.ts:13`, `:25`, `:53` | Cada pago se convierte directamente y se redondea a centavos de la moneda de factura antes de sumar. Se conserva `sumMoney` sin modificar su política general. Se siguen las reglas de la vista SQL: moneda nula del pago hereda la factura; TC = 1 en divisa es faltante; misma moneda no exige TC. |
| N7 | `src/features/invoices/lib/__tests__/paymentCurrency.test.ts:5` | Factura USD 100 / TC 17.5 / dos pagos MXN 1: antes `totalPaid=0.11`; después `totalPaid=0.12`, saldo `99.88`. |
| N8 | `src/features/invoices/components/invoice-detail/validateEditPaymentAmount.ts:24` | Primero recupera la contribución original en moneda de factura y la suma al saldo; convierte ese máximo a moneda de pago antes de compararlo con el nuevo importe. Si falta TC, bloquea con explicación. |
| N8 | `src/features/invoices/components/invoice-detail/EditPaymentDialog.tsx:59`, `:89`, `:133` | Recibe moneda/TC de factura, pasa moneda/TC de pago al validador y muestra el máximo y la moneda correctos. Conserva importe deshabilitado y envío de importe/fecha originales en REP timbrado. |
| N8 | `src/features/invoices/components/invoice-detail/InvoicePaymentSummary.tsx:73`, `:116`; `src/features/invoices/components/invoice-detail/InvoiceDetailBody.tsx:161` | Propaga moneda y TC de factura hasta el editor. |
| N8 | `src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts:12`; `src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogCurrency.test.tsx:37` | Factura USD 100 / TC 17.5 / saldo USD 90 / original MXN 175: antes MXN 350 era rechazado con máximo 265; después 350 y 1750 pasan, exceso muestra máximo MXN 1750. |

Referencia canónica inspeccionada, **no ejecutada** en base: `supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql:25` (`fx_convert_amount`) y `:54` (`v_invoices_with_balance`); `supabase/migrations/20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql:2` (`fx_is_missing`).

## Pruebas ejecutadas antes y después

Antes de editar implementación se agregaron las regresiones y se ejecutaron contra el código de la base auditada. Los fallos de arranque del entorno no se cuentan como fallos funcionales.

| Evidencia | Resultado ejecutado |
| --- | --- |
| `before-vitest.log` | 2 archivos fallan / 1 pasa; 8 tests fallan / 8 pasan. Incluye `.11` frente a `.12` y máximo `265` frente a `1750`. |
| `after-vitest.log` | Mismo comando y mismos tres archivos: 16 / 16 pasan. |
| `before-dialog-vitest.log` | Diálogo real con mutación simulada: 3 fallan / 1 pasa. Incluye rechazo incorrecto de MXN 350, mensaje 265 y preservación REP. |
| `after-dialog-vitest.log` | Mismo comando y archivo: 4 / 4 pasan. |
| `related-vitest.log` | Permisos/propagación de TC y suite monetaria existente: 22 / 22 pasan. |
| `final-vitest.log` | Los seis archivos juntos con el estado final: 42 / 42 pasan, 6 / 6 archivos, salida 0. |
| `lint-final.log` | ESLint en todos los archivos cambiados: salida 0, sin advertencias ni errores. |

Directorio de trabajo para todos los comandos:

```powershell
C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-payments
```

Prefijo exacto usado en cada ejecución de Vitest (TEMP del sandbox causó EPERM al renombrar su caché; el directorio del worktree ya era escribible):

```powershell
$env:TEMP = 'C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-payments\.tool-tmp'
$env:TMP = $env:TEMP
```

Comando exacto de regresiones antes / después:

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/lib/__tests__/paymentCurrency.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogValidation.test.ts --maxWorkers=2
```

Comando exacto del diálogo antes / después:

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogCurrency.test.tsx --maxWorkers=2
```

Comando exacto de verificaciones relacionadas:

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoice-detail/__tests__/InvoicePaymentPermissions.test.tsx src/lib/money/money.test.ts --maxWorkers=2
```

Comando exacto de suite final:

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/lib/__tests__/paymentCurrency.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogCurrency.test.tsx src/features/invoices/components/invoice-detail/__tests__/InvoicePaymentPermissions.test.tsx src/lib/money/money.test.ts --maxWorkers=2
```

Comando exacto de lint final:

```powershell
node node_modules/eslint/bin/eslint.js src/features/invoices/lib/paymentCurrency.ts src/features/invoices/lib/__tests__/paymentCurrency.test.ts src/features/invoices/components/invoice-detail/EditPaymentDialog.tsx src/features/invoices/components/invoice-detail/InvoicePaymentSummary.tsx src/features/invoices/components/invoice-detail/InvoiceDetailBody.tsx src/features/invoices/components/invoice-detail/validateEditPaymentAmount.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogCurrency.test.tsx src/features/invoices/components/invoice-detail/__tests__/InvoicePaymentPermissions.test.tsx
```

La salida se capturó con `2>&1 | Tee-Object -FilePath <archivo.log>` y se anexó `EXIT_CODE=$LASTEXITCODE` mediante variable inmediatamente después del comando. `git diff --check` también pasó.

## Límites y pendientes para el integrador

- `node node_modules/typescript/bin/tsc --noEmit` se inició, pero se canceló con Ctrl+C por indicación del padre para evitar procesos globales competidores. **No se presenta como pasado.** Typecheck y build de integración quedan al padre. No se ejecutó build en este worktree.
- No se modificó ni ejecutó SQL, migraciones o permisos. Tampoco se usó Chrome ni se realizaron transacciones reales.
- La corrección alinea detalle/edición con la vista de saldo, pero no prueba paridad completa con el trigger servidor. La última definición fuente de `public.enforce_payment_within_invoice_total()` está en `supabase/migrations/20260826222741_fa65f23f-d7de-4354-8ddc-862482b5a4fa.sql:189`; el cálculo de pagos existentes/nuevo en `:223` y `:234` usa CASE con aritmética sin `fx_convert_amount` ni redondeo de cada pago. Para MXN → divisa da precedencia a `payment.exchange_rate` sobre el TC de factura. Los parches `20260831001251_1b9bffec-28a0-43c4-ab0a-00a2e27afad9.sql:6` y `20260831001949_add04009-b717-447d-ad1f-0eb7b0b5b875.sql:5` agregan bloqueo/borrador/PUE; no sustituyen esa conversión. Se conserva esta guarda servidor y se informa al padre para revisión coordinada. No se probó su definición desplegada ni su aceptación de los casos sintéticos.
- La creación de junction local `node_modules` falló inicialmente por `Access is denied`; la misma acción con `require_escalated` fue aprobada y terminó con salida 0. El primer intento con destino relativo falló porque PowerShell exige destino absoluto. Son problemas del entorno resueltos, no denegaciones pendientes ni resultados funcionales.

## N8 — ajuste posterior de frontera de centavos

La revisión adicional se ejecutó sobre `39ead72e587e6e9a61b1a922f406315e0840de73`. Detectó que la corrección inicial todavía aplicaba la tolerancia en moneda de pago. El estado final convierte **original y candidato nuevo a moneda de factura**, redondeando cada pago con `convertCurrencyAmount`, y compara allí contra saldo + contribución original, con la tolerancia existente de 0.01 en moneda de factura. La conversión inversa del máximo sólo se usa para el mensaje. Guarda REP y servidor sin cambios. Archivo: `src/features/invoices/components/invoice-detail/validateEditPaymentAmount.ts:25`, `:39`, `:46`.

Los tres casos sintéticos nuevos en `EditPaymentCurrencyRounding.test.ts` fallaron antes y pasaron después:

- Factura MXN 17.50, saldo 0, original USD 1 / TC 17.5: editar USD 1.01 convierte a MXN 17.68 y se rechaza. Antes se aceptaba por tolerancia USD 0.01.
- Factura USD 100, saldo 0, original MXN 1750 / TC de factura 17.5: editar MXN 1750.02 convierte a USD 100.00 y pasa. Antes se rechazaba por exceso MXN 0.02.
- Tolerancia en factura USD: MXN 1750.26 convierte a USD 100.01 y pasa; MXN 1750.27 convierte a USD 100.02 y se rechaza. También se cubre la frontera inversa en factura MXN. Dos asserts de exceso anteriores ahora usan MXN 1751, pues MXN 1750.02 no cambia los centavos de USD.

Evidencia ejecutada: `n8-cents-before-vitest.log` (3/3 fallan, salida 1), `n8-cents-after-vitest.log` (3/3 pasan, salida 0), `n8-cents-final-vitest.log` (23/23 pasan en cinco archivos, salida 0), `n8-cents-lint.log` (salida 0 sin avisos). No se repitieron tipos/build globales ni se ejecutó SQL.

Comando exacto antes / después (con el mismo prefijo TEMP/TMP indicado arriba):

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyRounding.test.ts --maxWorkers=2
```

Comando exacto de regresiones finales del ajuste:

```powershell
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyRounding.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogCurrency.test.tsx src/features/invoices/lib/__tests__/paymentCurrency.test.ts --maxWorkers=2
```

Comando exacto de lint del ajuste:

```powershell
node node_modules/eslint/bin/eslint.js src/features/invoices/components/invoice-detail/validateEditPaymentAmount.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyValidation.test.ts src/features/invoices/components/invoice-detail/__tests__/EditPaymentCurrencyRounding.test.ts
```
