# fix-05.diff — Validación y plan de aplicación

Revisé los cinco arreglos contra el código actual. Los cinco describen problemas reales y ninguno está ya aplicado. Uno (M-13) necesita más trabajo del que trae el parche: el backend hoy no devuelve la tasa de IVA del cliente en la vista previa, así que el parche por sí solo dejaría el 16% fijo de siempre.

## Qué se arregla

### H-10a / H-10b — Listas sin tope y sin aviso (Cuentas por pagar)
Hoy `useExportablePayables` pide facturas y cuentas bancarias **sin límite**: con muchos registros la consulta puede volverse lenta o cortarse sin avisar. Y la página de Antigüedad de Saldos ya recibe datos que sí vienen topados (501 filas) pero nunca muestra el aviso de "lista truncada", así que los totales pueden verse incompletos sin que nadie se entere.

- Agregar `.limit(LIST_FETCH_LIMIT)` a ambas consultas de exportables y exponer `isTruncated`.
- Mostrar el aviso `ListTruncationNotice` en la página de Antigüedad, usando la lista cruda que ya trae el hook.

### M-13 — Vista previa de facturas recurrentes con IVA equivocado
La vista previa suma siempre con 16%. Para clientes de frontera (8%) o exentos (0%) el total mostrado no coincide con la factura que realmente se genera (el proceso real sí usa la tasa del cliente). Además la suma se hace con decimales crudos, lo que puede desviar centavos al acumular varias líneas.

- Backend: la vista previa devolverá la tasa de IVA del cliente por línea.
- Frontend: calcular el IVA por línea con esa tasa y acumular en centavos.

### M-14 — Antigüedad de saldos inflada
Tres defectos en el mismo cálculo:
- Facturas **sin fecha de vencimiento** se envejecen desde su fecha de emisión, así que aparecen como vencidas cuando en realidad no lo están. Pasarán a "Corriente".
- Facturas en moneda extranjera **sin tipo de cambio** se cuentan 1:1 (un dólar como un peso), subestimando la cartera. Se excluyen del reporte, igual que en flujo de efectivo.
- Sumas con decimales crudos → se cambian a suma en centavos.

### L-7 — Validaciones de captura
- Pagos: techo de $99,999,999.99 con mensaje claro (hoy un dedazo de ceros pasa sin freno).
- Montacargas: la vigencia del seguro debe caer entre los años 2000 y 2100 (evita fechas tipo "año 0221").

## Detalle técnico

| Fix | Archivos |
|---|---|
| H-10a | `src/features/accounts-payable/hooks/useExportablePayables.ts` (`LIST_FETCH_LIMIT` en ambas queries, `isTruncated` con `hasReachedListLimit`) |
| H-10b | `useAgingReport.ts` devuelve `rawBills: data`; `AgingReportPage.tsx` renderiza `<ListTruncationNotice rows={rawBills} />` |
| M-13 | `supabase/functions/generate-recurring-invoices/index.ts`: precargar `customers.tax_rate` de los `customer_id` del preview y agregar `taxRate` a `PreviewLine`. `usePreviewRecurringInvoices.ts`: campo `taxRate?: number \| null`. `RecurringInvoicesPreviewDialog.tsx`: helper `vatRateFor` + `sumMoney(lines.map(l => applyVat(l.billedAmount, vatRateFor(l))))` |
| M-14 | `useAgingReport.ts`: `isFxMissing` (de `cashFlowTransformers`), bucket `current` cuando `due_date` es nulo, `sumMoney` en filas y totales |
| L-7 | `useRecordPaymentForm.ts`: constante `MAX_PAYMENT_AMOUNT` + guard antes de persistir. `forkliftFormSchema.ts`: `superRefine` sobre `insurance_expiry` (2000–2100) |

Sin cambios de base de datos ni migraciones SQL.

## Verificación
- Pruebas nuevas: aging (sin `due_date`, moneda sin TC, sumas), tope de monto en pagos, schema de montacargas, IVA por línea en la vista previa.
- Correr suite completa de Vitest, lint y build.
- Actualizar `public/changelog.json` y `public/changelog/vX.Y.Z.json` como **minor** (v7.339.0).
