# Mejorar la experiencia: Cierre de OT y Alta de CxP

Dos flujos que hoy funcionan pero se sienten "en bruto": cerrar una orden de trabajo es un arrastre silencioso en el Kanban, y dar de alta una factura de proveedor es un formulario largo y plano. Este plan mejora la experiencia de ambos sin cambiar reglas de negocio ni la base de datos.

## 1. Cierre de OT (Mantenimiento)

Hoy: se arrastra la tarjeta a "Completado" y se actualiza el estatus al instante. No hay confirmación, ni resumen de costos, ni aviso de que al cerrar se bloquean refacciones y mano de obra.

Mejoras:

- **Diálogo de cierre** al soltar la tarjeta en "Completado" (y desde un botón "Cerrar OT" en el panel de detalle, para no depender solo del arrastre).
  - Resumen antes de confirmar: equipo, tipo de servicio, refacciones (cantidad y monto), mano de obra (horas y monto), costo manual y **costo total**.
  - Campos: fecha de cierre (default hoy, zona Monterrey) y notas de cierre opcionales.
  - Aviso claro: "Al cerrar ya no podrás editar refacciones ni mano de obra".
  - Botones: Cancelar / Cerrar OT. Cancelar revierte la tarjeta a su columna original.
- **Aviso de daño abierto**: si la OT proviene de un daño aún en reparación, mostrar la alerta dentro del diálogo antes de confirmar, en lugar de dejar que el error llegue del servidor.
- **Estado post-cierre visible**: en el panel de detalle, banda superior con "OT cerrada el DD/MM/AAAA" y costo total, y las secciones de refacciones/mano de obra en modo lectura con la razón explícita.
- **Feedback**: toast de éxito con el folio y monto; si el equipo quedó en estatus "mantenimiento", ofrecer marcarlo disponible (reutilizando el diálogo que ya existe al crear).

## 2. Alta de CxP (Cuentas por pagar)

Hoy: un formulario continuo con ~13 campos, dropzone de XML arriba y un total al fondo. Las advertencias de RFC llegan como toast y la aprobación es invisible.

Mejoras:

- **Secciones con el lenguaje visual estándar** (encabezados small-caps con separador), igual que Mantenimiento:
  1. Comprobante (dropzone XML + resultado del CFDI)
  2. Proveedor y clasificación
  3. Fechas y cobertura
  4. Importes
- **Resumen del CFDI importado**: en vez del chip pequeño, una tarjeta con emisor, RFC, serie-folio, UUID, total y moneda, más un botón para quitar el archivo y capturar manualmente.
- **Avisos inline, no solo toast**: proveedor no encontrado por RFC y RFC receptor distinto al de la empresa se muestran como alerta dentro de la sección correspondiente, con acción directa ("Crear proveedor" / "Seleccionar proveedor").
- **Panel de importes pegajoso**: subtotal, IVA, retenciones y **total** siempre visibles al pie del diálogo mientras se captura, con formato MXN es-MX.
- **Vencimiento explicado**: cuando se autocompleta por los días de crédito del proveedor, mostrarlo como campo prellenado con etiqueta "Sugerido por proveedor (N días)" y opción de limpiarlo, en lugar de llenarse en silencio.
- **Aprobación anticipada**: si el total supera el umbral configurado en Ajustes, mostrar un aviso antes de guardar: "Esta factura requerirá aprobación de un administrador". Solo lectura del umbral existente, sin cambiar la lógica.
- **Estados de captura**: botón de guardar deshabilitado con motivo visible cuando falten campos obligatorios, y bloqueo de doble envío.

## Detalles técnicos

- Frontend únicamente: sin migraciones ni cambios de RPC. El cierre sigue usando la mutación actual de `work_status`; el diálogo solo agrega intención y contexto.
- Archivos principales: `MaintenanceKanban.tsx`, `useMaintenanceKanban.ts`, ambos `MaintenanceDetailSheet.tsx`, nuevo `CloseWorkOrderDialog.tsx`; `SupplierBillFormDialog.tsx`, `SupplierBillFormFields.tsx`, `SupplierBillCfdiDropzone.tsx`, `useSupplierBillForm.ts`.
- Reutilizar `FormDialog`, `FormSection`, `RequiredMark`, campos de `components/forms/fields`, `Icon`, tokens semánticos (sin colores hardcodeados), `formatCurrency`, `nowMty`/`toYMD`.
- Componentes ≤150 LOC, hooks ≤80; lógica en hooks, vistas puras.
- Pruebas: cobertura del diálogo de cierre (resumen, cancelación, aviso de bloqueo) y del formulario de CxP (secciones, aviso de umbral, avisos inline de RFC).
- Cierre: nueva entrada en `public/changelog.json` + `public/changelog/v7.268.0.json` y alineación de `package.json` / `version.json`.
