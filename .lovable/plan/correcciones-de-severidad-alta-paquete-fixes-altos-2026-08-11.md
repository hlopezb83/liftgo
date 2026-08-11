# Correcciones de severidad alta (paquete "fixes altos")

Revisé los 6 hallazgos contra el código real y la base de datos: **los 6 son bugs reales**. Un punto del diff propuesto lo voy a resolver distinto (mejor) y lo explico abajo.

## 1. Descuento del CFDI en facturas de proveedor

Hoy `parseCfdiXml` ignora el atributo `Descuento` del Comprobante y el formulario calcula `total = subtotal + IVA − retenciones`. Con un CFDI con descuento, la CxP queda inflada.

- Leer `Descuento` al importar el XML y mostrar un campo "Descuento" en el formulario.
- Total = subtotal − descuento + IVA − retenciones.
- **Diferencia con el diff propuesto:** ahí el descuento no se guarda (la tabla no tiene columna) y al editar se asume 0, lo que al volver a guardar cambiaría el total en silencio. En su lugar agrego la columna `discount` a `supplier_bills` (default 0) para que el dato persista y la edición sea fiel.

## 2. Exportación de pagos: monedas mezcladas

El Excel y el resumen del modal suman MXN y USD en un solo número y etiquetan el total con la moneda de la primera fila.

- Totalizar por moneda: un renglón `TOTAL MXN`, otro `TOTAL USD` en el Excel.
- En el modal, mostrar un total por moneda en vez de uno solo.

## 3. Descuento fijo "$" duplicado en cotizaciones de renta

Cuando una renta genera varias partidas (mensual + semanal + diaria), el descuento en pesos se copia a **todas**, así que se resta N veces y el total no coincide con la vista previa.

- Aplicar el descuento "$" solo a la primera partida. Los porcentuales "%" siguen aplicando a cada partida (es lo correcto).

## 4. Factura desde cotización en USD se emitía en MXN

Al convertir una cotización a factura no se hereda la moneda; una cotización en USD generaba un CFDI en MXN.

- Heredar `USD` al armar la factura; el campo de tipo de cambio aparece solo y el usuario captura el TC real (mismo comportamiento que al cambiar la moneda a mano).

## 5. Entregas creadas "ya completadas" sin `completed_at`

Tanto en el diálogo de entregas como en el posterior a la reserva, marcar "ya completada" guarda `status = completed` pero deja `completed_at` en nulo, y los cálculos de horas e historial filtran por `completed_at`.

- Sellar `completed_at` al crear la entrega ya completada.

## 6. Retornos pendientes truncados

`/returns/pending` toma el listado genérico de reservas (limitado y ordenado por fecha de inicio descendente) y filtra en el navegador: los retornos **más vencidos** pueden quedar fuera del listado y no verse nunca.

- Nueva consulta dedicada con filtros en el servidor (confirmadas, sin devolución, fecha fin anterior a hoy en horario de Monterrey) y orden por fecha fin ascendente, con un tope de seguridad alto.

## Detalle técnico

- Migración: `ALTER TABLE public.supplier_bills ADD COLUMN discount numeric(14,2) NOT NULL DEFAULT 0` + check `>= 0`.
- Archivos: `parseCfdiXml.ts`, `useImportSupplierBillCfdi.ts`, `useSupplierBillForm.ts`, `SupplierBillFormFields.tsx`, `buildPaymentsXlsx.ts`, `usePaymentSelection.ts`, `useExportPaymentsForm.ts`, `PaymentsExportSummary.tsx`, `ExportPaymentsDialog.tsx`, `quoteFormBuilders.ts`, `invoiceFormBuilders.ts`, `DeliveryFormDialog.tsx`, `PostBookingDeliveryDialog.tsx`, nuevo `src/features/returns/hooks/usePendingReturns.ts`, `PendingReturnsPage.tsx`.
- Dinero siempre vía `roundMoney` / `formatCurrencyWithCode`.
- Tests: descuento en `parseCfdiXml`, totales por moneda en `buildPaymentsXlsx`, descuento "$" una sola vez en `quoteFormBuilders`, más el ajuste del fixture de `schemas.zodResolver.test.ts`.
- Cierre: entrada nueva en `public/changelog.json` + `public/changelog/v7.290.0.json` (minor).
