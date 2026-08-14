# Cierre de hallazgos F6–F10

Verifiqué los cinco parches contra el código actual: los cinco describen el estado real del repo y aplican limpio.

## F6 — "Costo Real" en $0 invisible
`DamageDetailSheet` solo muestra el costo real si es mayor a cero, así que un daño reparado sin costo (garantía) se ve igual que uno sin capturar. Se mostrará también cuando el daño esté `repaired` o `invoiced`, aunque el monto sea $0.

## F7 — Tarifas de montacargas con 3+ decimales
`buildForkliftPayload` guarda tarifas y costos con `parseFloat` crudo. Se agregan helpers `moneyOrZero`/`moneyOrNull` que aplican `roundMoney` (2 decimales) a `daily_rate`, `weekly_rate`, `monthly_rate`, `acquisition_cost` e `insurance_cost`.

## F8 — Clasificación renta/venta por substring frágil
`isRentalOrSaleLine` descarta cualquier descripción que contenga "Renta mensual/semanal/diaria". Se cambia al regex anclado ` — Renta (mensual|semanal|diaria)`, que es el formato exacto que generan `generateLineItemsFromForklift`/`FromModel`. Así una línea manual tipo "Renta diaria de operador" deja de descartarse por error.

## F9 — Advertencia al facturar un daño sin reparar
Facturar un daño en estado `reported` cobra el costo estimado y ya no admite ajuste automático. Se agrega un `ConfirmDialog` con el monto y la advertencia de que la diferencia requeriría nota de crédito o cargo manual. Daños `repaired` siguen navegando directo.

## F10 — Bandera muerta `isPayable`
`computePaymentFlags` calcula dos banderas divergentes; `isPayable` no tiene consumidores (confirmado por búsqueda: solo la definición y una aserción de prueba redundante). Se elimina de la interfaz, del cálculo y del retorno, y se quita la aserción duplicada del test.

## Detalles técnicos

Archivos a tocar:
- `src/features/damage/components/damage/DamageDetailSheet.tsx`
- `src/features/fleet/lib/forkliftPayload.ts`
- `src/lib/domain/nonRentalLines.ts`
- `src/features/damage/components/damage/DamageActions.tsx`
- `src/lib/rules/invoices.ts` + `src/lib/rules/__tests__/invoicesPendingCancel.test.ts`

Pruebas: agregar cobertura nueva para F6 (costo $0 según estado), F7 (redondeo de "500.999" → 501) y F8 (línea manual "Renta diaria de operador" se conserva). Las suites existentes (`forkliftPayload.test.ts`, `nonRentalLines.test.ts`) siguen pasando sin cambios.

Cierre: typecheck, ESLint sin advertencias, suite completa, y entrada de changelog **v7.328.0** (minor: cambios de comportamiento visibles) con sincronización de `package.json` y `version.json`.
