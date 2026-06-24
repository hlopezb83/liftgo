## Objetivo

Agregar la capacidad de crear una Factura de Proveedor importando el XML del CFDI 4.0, evitando capturar manualmente los datos.

## Flujo de usuario

1. En `/cuentas-por-pagar`, junto al botón **"Nueva Factura"**, aparece un botón secundario **"Importar XML"**.
2. Al hacer clic, se abre un diálogo que permite arrastrar/seleccionar uno o varios archivos `.xml` (CFDI emitido por el proveedor).
3. Por cada XML:
   - Se parsea en el cliente (sin enviar a un servidor) extrayendo: RFC emisor, nombre, UUID (TimbreFiscalDigital), folio/serie, fecha emisión, subtotal, IVA trasladado, retenciones (IVA/ISR), total, moneda, tipo de cambio, MetodoPago (PUE/PPD), FormaPago.
   - Se busca el proveedor por RFC en la tabla `suppliers`. Si no existe, se ofrece un selector manual o crear nuevo proveedor (link a `/proveedores/nuevo`).
   - Se valida que el UUID no exista ya en `supplier_bills.cfdi_uuid` (evitar duplicados).
4. Se muestra una **vista previa editable** con los datos extraídos (reutilizando los campos del `SupplierBillFormDialog`), donde el usuario completa **Categoría** y **Vencimiento** (si no se infiere del proveedor) y puede ajustar cualquier campo.
5. Al confirmar, se registra la factura con el mutation existente `useCreateSupplierBill`. El XML original se sube a Storage y se vincula al registro.

## Cobertura técnica

- **Parser CFDI**: nuevo util `src/features/accounts-payable/lib/parseCfdiXml.ts` usando `DOMParser` nativo. Soporta CFDI 4.0 (namespace `cfdi`) y extrae nodos `Comprobante`, `Emisor`, `Receptor`, `Impuestos/Traslados`, `Impuestos/Retenciones`, `Complemento/TimbreFiscalDigital`.
- **Validaciones**:
  - Tipo de comprobante = `I` (Ingreso); rechazar nóminas/pagos.
  - RFC receptor debe coincidir con `company_settings.rfc` (warning si no).
  - UUID único.
- **Nuevo componente**: `ImportSupplierBillXmlDialog.tsx` con dropzone (reusar `DragDropImageUploader` patrón o input `accept=".xml"`).
- **Storage**: subir XML a bucket existente (verificar si hay uno para supplier-bills, sino crear `supplier-bill-xml` privado) y guardar URL en un campo (verificar columna existente o usar `description`/metadata; si no existe campo, agregar `cfdi_xml_url TEXT` vía migración).
- **Reuso**: el diálogo de preview usa el mismo `useSupplierBillForm` hook precargando los valores extraídos.

## Cambios de DB

- Migración: agregar columna `cfdi_xml_url TEXT` a `supplier_bills` (nullable). Crear bucket privado `supplier-bill-xml` con políticas por rol (admin/administrativo full).
- Índice único parcial sobre `cfdi_uuid` ya existe? Verificar; si no, agregarlo para prevenir duplicados a nivel DB.

## Archivos a crear/modificar

- Crear `src/features/accounts-payable/lib/parseCfdiXml.ts` + test.
- Crear `src/features/accounts-payable/components/ImportSupplierBillXmlDialog.tsx`.
- Modificar `CuentasPorPagarPage.tsx`: agregar botón "Importar XML".
- Modificar `useSupplierBillForm.ts`: aceptar `initialValues` opcionales.
- Migración SQL: columna + bucket + índice único `cfdi_uuid`.
- Changelog `v6.84.0` (minor: nueva funcionalidad).

## Preguntas antes de implementar

1. **Múltiples XML a la vez**: ¿quieres carga masiva (varios XML en una sola operación, cada uno se registra automáticamente si tiene proveedor y categoría inferible) o uno por uno con preview editable?
2. **Categoría**: el CFDI no trae categoría de gasto interna. ¿Quieres que se autocomplete desde una **categoría por defecto del proveedor** (requeriría agregar `default_expense_category` a `suppliers`) o siempre se elige manualmente en el preview?
3. **PDF del CFDI**: ¿también quieres adjuntar el PDF cuando el usuario lo cargue junto al XML, o solo XML por ahora?
