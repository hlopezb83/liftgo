# H-5 — Tope de notas de crédito frente a pagos ya cobrados

## Mi opinión

Tienes razón en el fondo, y me retracto de la opción B pura. El punto que traes —los pagos ya generaron REP y cancelar un REP ante el SAT puede tardar días— es exactamente el motivo por el que conviene un candado duro: si el sistema deja emitir la NC primero, el operador se queda con una factura cuyo total quedó por debajo de lo que los REP declaran pagado, y ese desorden ya no se arregla en la app, se arregla ante el SAT.

Pero la mejor práctica no es bloquear por *cualquier* pago, sino por los pagos que tienen un **REP timbrado y vigente**:

- **Factura PUE (pago en una exhibición, sin REP):** fiscalmente la NC sobre una factura ya cobrada es válida y común (devolución o bonificación); genera saldo a favor del cliente y se aplica contra la siguiente factura. Bloquearla no aporta nada y sí estorba.
- **Factura PPD con REP timbrados:** cada REP declara ante el SAT un importe pagado contra esa factura. Una NC que deje el total por debajo de la suma de los REP vigentes deja el CFDI en estado inconsistente. Aquí el orden correcto —y el que el sistema debe forzar— es: cancelar el REP, esperar la aceptación del SAT, y entonces emitir la NC.
- **Pago capturado sin REP timbrado, o con REP ya cancelado:** no hay declaración fiscal viva, así que no debe topar; sólo avisar que se generará saldo a favor.

O sea: opción A, pero medida contra el **pagado con REP vigente**, no contra el pagado bruto. Es más estricta que B donde importa y no estorba donde no importa.

## Qué se implementa

1. **Tope en base de datos.** El disparador `enforce_credit_note_max` pasa a validar:

   `NC previas vigentes + NC nueva  ≤  total de la factura − pagos con REP vigente`

   donde "pago con REP vigente" es un pago con folio fiscal de complemento timbrado y sin cancelación aceptada. El mensaje de error explica el bloqueo y nombra los complementos que hay que cancelar primero.

2. **Mismo tope en la interfaz.** `computeMaxCreditable` recibe el importe pagado con REP vigente y lo resta; el diálogo de nueva NC deja de ofrecer importe que el backend va a rechazar y muestra el desglose: total, NC previas, pagado con REP, máximo acreditable.

3. **Guía en pantalla, no sólo un "no".** Cuando el tope venga de complementos de pago, la tarjeta de notas de crédito lista esos REP con su estado (timbrado / cancelación pendiente / cancelado) y el botón para cancelarlos, de modo que el operador vea la secuencia completa sin adivinar. Se aclara que la aceptación del SAT puede tardar hasta 72 horas.

4. **Aviso de saldo a favor.** Si hay pagos sin REP vigente y la NC deja la factura por debajo de lo cobrado, se emite igual pero con advertencia visible de que queda saldo a favor del cliente (hoy no hay flujo de reembolso; se aplica contra facturas futuras).

## Fuera de alcance

- No se construye el módulo de saldo a favor / reembolsos.
- No se automatiza la cancelación de REP: se enlaza al flujo que ya existe.

## Detalles técnicos

- Migración: `public.enforce_credit_note_max` suma `payments.amount` donde `rep_cfdi_status = 'stamped'` y `rep_cancelled_at IS NULL`, con `SET search_path = public`; sin cambios de RLS ni de grants.
- `src/features/invoices/lib/computeMaxCreditable.ts`: nuevo parámetro `repBackedPayments`; se actualiza la nota BL-08 que hoy dice explícitamente que los pagos no topan.
- `src/features/invoices/components/invoice-detail/InvoiceCreditNotesCard.tsx`: consulta de pagos con REP de la factura, desglose del tope y lista de complementos a cancelar.
- `src/features/invoices/hooks/creditNotes/useCreditNoteForm.ts`: `exceedsMax` ya usa `maxCreditable`, sólo cambia el valor de entrada.
- `src/lib/errors/pgErrorCatalog.ts`: mensaje amable para el nuevo error del disparador.
- Pruebas: casos en `computeMaxCreditable` (PUE sin REP, PPD con REP vigente, REP cancelado), `useCreditNoteForm` (bloqueo del botón) y suite SQL de humo para el disparador.
- Cierre: entrada minor v7.334.0 en `CHANGELOG.md`, `public/changelog.json`, `public/changelog/v7.334.0.json`, `public/version.json` y `package.json`.

Si prefieres la opción A estricta —que **cualquier** pago registrado tope la NC, tenga REP o no— es cambiar una condición en el disparador y un filtro en la consulta; dímelo y lo ajusto antes de implementar.
