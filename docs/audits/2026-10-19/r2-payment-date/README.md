# R2: fecha capturada al registrar un pago

Base auditada: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

La reproducción monta `RecordPaymentDialog`, su hook, `DatePickerField` y
`MaskedDateInput` reales en Vitest. Sólo se sustituyen las mutaciones y los
avisos: la barrera de red de la suite permanece activa. No hay navegador,
backend, operación financiera ni llamada al PAC.

## Antes

Se captura `15/09/2026` como fecha válida y después se sustituye por una fecha
imposible, parcial, vacía o futura. La interfaz muestra el texto nuevo, pero el
submit conserva `payment_date: "2026-09-15"`. La captura parcial también permite
enviar antes del blur. El adapter del diálogo descarta `undefined` y el control
sólo lo emite para una captura parcial al perder foco.

Una llamada directa al hook con fecha ausente o `Invalid Date` alcanza la
mutación con `undefined` o `NaN-NaN-NaN`, respectivamente.

`before.json` / `before.log`: **7 fallos esperados y 2 controles que pasan**, sobre
el código de la base, usando los mismos nueve casos de la prueba nueva.

## Después

- La captura parcial invalida el valor al cambiar el texto, conservando la
  máscara y el aviso al salir del campo.
- El diálogo acepta `undefined`, muestra el error requerido junto al campo y
  deshabilita el botón hasta una captura válida.
- El submit valida la presencia y validez de la fecha antes de serializarla;
  también rechaza Enter/submit directo antes de blur.
- Corregir la fecha vuelve a habilitar el pago y envía exactamente el día nuevo.
  Reabrir el diálogo restablece la fecha inicial.

`after.json` / `after.log`: **9/9 PASS**. `related.json` / `related.log`:
**60/60 PASS en 9 archivos**, incluyendo campos opcionales, RHF, mantenimiento,
diálogos y edición de un pago con REP timbrado. `lint.log` y `types.log` vacíos
indican salida correcta sin diagnósticos.

No se cambian las reglas de fecha futura o anterior a emisión, la moneda, la
opción de REP, los permisos ni las guardas del servidor. No hace falta migración.

## Comandos

```powershell
$env:TEMP=(Join-Path (Get-Location) '.tool-tmp')
$env:TMP=$env:TEMP
$env:TMPDIR=$env:TEMP
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoices/__tests__/RecordPaymentDialogDate.test.tsx --maxWorkers 1 --reporter default --reporter json --outputFile.json docs/audits/2026-10-19/r2-payment-date/after.json
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/forms/MaskedDateInput.tsx src/components/forms/__tests__/MaskedDateInput.test.tsx src/components/forms/__tests__/DatePickerField.test.tsx src/features/invoices/components/invoices/RecordPaymentDialog.tsx src/features/invoices/hooks/invoices/useRecordPaymentForm.ts src/features/invoices/hooks/invoices/paymentFormDirty.ts src/features/invoices/components/invoices/__tests__/RecordPaymentDialogDate.test.tsx
```

La lista completa de archivos ejecutados se conserva en `related.json`.
`manifest.json` contiene conteos y huellas para comparar los resultados.
