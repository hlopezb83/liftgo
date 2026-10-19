# R2: forma SAT al editar un pago

Base auditada: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

## Resultado y alcance

El diálogo real de edición cambiaba `payment_method` de `transfer` a `cash`, pero omitía `payment_form_sat` en el PATCH. El registro conservaba `03`, consumido después por el constructor REP. El cambio añade un selector SAT visible y reutiliza los catálogos existentes. Cambiar método sugiere su clave predeterminada; el usuario puede revisar la clave y elegir, entre otras, `04`, `28` o `29` para tarjeta.

Guardar notas o volver a seleccionar el mismo método conserva overrides existentes. La forma SAT se envía sólo cuando cambia respecto del registro: no se recalcula al guardar ni se inventa una clave ausente para una edición de notas. Con REP timbrado, método y forma SAT están deshabilitados; el PATCH conserva método, monto y fecha originales y omite siempre `payment_form_sat`, incluida una forma SAT histórica nula.

No se modifica el handler REP, SQL, permisos ni la política de claves SAT del registro de pagos. No se llama al proveedor, no se ejecuta RLS ni se opera un navegador o backend publicado.

## Evidencia comparable

La misma suite de regresión monta `EditPaymentDialog` real con los controles y el resolver reales. Sólo sustituye la mutación y adaptadores de notificaciones/navegación. Interactúa con los selectores y comprueba el payload de la mutación. Los tests de conservación combinan el PATCH con el registro original para comprobar la semántica de una actualización parcial; no simulan una validación de base de datos.

| Verificación | Antes | Después |
| --- | --- | --- |
| Suite SAT, 14 casos | 11 FAIL / 3 PASS | 14 PASS |
| Relacionadas, 6 archivos | — | 48 PASS |
| ESLint de componente y test | — | PASS, sin advertencias |
| `tsc --noEmit` | — | PASS |

Los tres controles que ya pasan en la base cubren notas con override `28`/`29` y seleccionar de nuevo el mismo método con override `28`. Las regresiones cubren transferencia→efectivo (`03`→`01`), defaults compartidos, override explícito de tarjeta, cambio de pago en un diálogo montado, legado sin SAT e inmutabilidad fiscal de REP timbrado.

`before.json`, `after.json` y `related.json` contienen resultados resumidos sin volcado del DOM ni rutas privadas. `manifest.json` registra hashes SHA-256 de texto UTF-8 normalizado a LF y el blob Git del componente antes. Se ejecutó la suite antes sustituyendo temporalmente sólo este componente por su blob de la base y restaurándolo con `finally`; después se ejecutaron los seis archivos relacionados con el componente corregido.

```powershell
$env:TEMP=(Join-Path (Get-Location) '.tool-tmp')
$env:TMP=$env:TEMP
$env:TMPDIR=$env:TEMP
node node_modules/vitest/vitest.mjs run src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogSat.test.tsx --maxWorkers 1
node node_modules/eslint/bin/eslint.js src/features/invoices/components/invoice-detail/EditPaymentDialog.tsx src/features/invoices/components/invoice-detail/__tests__/EditPaymentDialogSat.test.tsx
node node_modules/typescript/bin/tsc --noEmit
```

La evidencia es de componente/payload offline. El QA GUI posterior y el flujo REP publicado corresponden al operador autorizado.
