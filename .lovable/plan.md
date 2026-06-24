## Objetivo
Integrar la importación de CFDI XML dentro del modal "Nueva Factura de Proveedor" y eliminar el botón extra "Importar XML" de la barra de acciones de `/cuentas-por-pagar`.

## Cambios

### 1. `SupplierBillFormDialog.tsx`
- Agregar una sección superior (solo cuando `!isEdit && !bill`) con una **dropzone CFDI** compacta: "Arrastra el XML aquí o haz clic — opcional, autocompleta los campos".
- Al soltar/seleccionar XML: parsear, validar UUID, verificar duplicado, subir a Storage y hacer `form.reset({ ...defaults, ...initialValues })` + guardar `cfdiXmlUrl` en estado local que se pasa como `overrides.cfdiXmlUrl` al submit (vía `useSupplierBillForm`).
- Mostrar estados: idle / procesando (spinner) / éxito (chip "CFDI cargado · UUID xxxx") / error (Alert inline).
- Warnings no bloqueantes (RFC receptor distinto, proveedor no encontrado) siguen vía `notifyWarning` toast.

### 2. Nuevo hook `useImportSupplierBillCfdi.ts`
Extrae la lógica de parseo + verificación de duplicado + upload desde `ImportSupplierBillXmlDialog`, para mantener el form dialog ≤150 LOC y reutilizable. Devuelve `{ importXml, busy, error, reset, result }`.

### 3. `CuentasPorPagarPage.tsx`
- Eliminar el botón `<Button … Importar XML>` (línea 57-59) y el ícono `FileUp` del import.
- Eliminar `importDialog` (`useToggleDialog`) y el render de `<ImportSupplierBillXmlDialog … />`.
- Eliminar import de `ImportSupplierBillXmlDialog`.

### 4. Borrar archivo
- `src/features/accounts-payable/components/ImportSupplierBillXmlDialog.tsx` (su funcionalidad queda absorbida por el form dialog + hook).

### 5. Changelog (patch)
- Crear `public/changelog/v6.88.3.json` y agregar la entrada en `public/changelog.json` describiendo: "Importación de CFDI XML unificada dentro del modal de Nueva Factura de Proveedor; se removió el botón extra de la barra".

## Notas técnicas
- No cambia la firma de `useSupplierBillForm` ni de `SupplierBillFormOverrides`: el dialog sigue pasando `overrides={{ initialValues, cfdiXmlUrl }}` internamente cuando se importa XML, solo que ahora desde su propio estado en lugar de venir de un dialog padre.
- En modo edición la dropzone no se renderiza (un CFDI ya facturado no se reimporta).
- Sin cambios en backend, RLS, ni en el bucket `supplier-bill-cfdi-xml`.
