# Error 23514 al crear factura: diagnóstico y cierre

## Qué pasó (en corto)

El usuario **no hizo nada mal**. Ligó la factura a una reserva y dejó vacío el **Periodo de facturación**. La base de datos tiene una regla: *si la factura trae reserva, debe traer periodo*. Es como un formulario del SAT donde una casilla obliga a llenar otra.

Lo importante: el reporte viene de la **versión 7.332.0**, y ese hueco ya se tapó en la **7.363.1** (la app hoy va en 7.365.0). Desde esa versión, si el periodo llega vacío se deriva automáticamente del mes de emisión (`resolveBillingPeriod` en `useInvoiceFormSubmit.ts`), así que el error ya no debería reproducirse.

Analogía: el usuario usó una copia vieja del formulario, impresa antes de que le agregáramos el campo autollenado.

## Verificado

- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts` ya deriva inicio/fin del periodo cuando hay reserva y el formulario no trae fechas.
- `public/changelog.json` confirma que la app está en 7.365.0, muy por encima de la 7.332.0 reportada.

## Qué propongo hacer

1. **Confirmar versión en producción**: revisar que la app publicada sirva 7.365.0 y no una build vieja en caché. Si la publicada está atrasada, republicar.
2. **Reproducir el caso** en la versión actual: `/invoices/new`, seleccionar cliente + reserva, dejar el periodo vacío y guardar. Debe crearse con el periodo del mes de emisión.
3. **Mejorar el mensaje y la UI del formulario** (por si el usuario quiere control explícito):
   - Prellenar visiblemente el periodo con el mes de emisión (o con las fechas de la reserva) al seleccionar una reserva, en lugar de derivarlo solo al guardar.
   - Si aun así falla, que el mensaje de error apunte al campo "Periodo de facturación" y lo resalte.
4. **Actualizar el changelog** con la entrada correspondiente (patch).

## Detalles técnicos

- Regla de BD: check constraint que exige `billing_period_start`/`billing_period_end` no nulos cuando `booking_id` no es nulo (código Postgres 23514).
- Red de seguridad de cliente: `resolveBillingPeriod(start, end, issueDate)` usa `monthBounds(nowMty())` como respaldo.
- Cambio de UI: al elegir reserva, sembrar los campos del formulario con las fechas de la reserva recortadas al mes de emisión, respetando `nowMty()` para evitar corrimientos de zona horaria.
