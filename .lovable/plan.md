## Problema

El módulo de Cuentas por Pagar arroja `PGRST204: Could not find the 'cfdi_xml_url' column of 'supplier_bills'`. El hook `useSupplierBillForm` (línea 145) envía `cfdi_xml_url` al insertar/actualizar, pero la tabla `public.supplier_bills` nunca recibió esa columna en una migración. El uploader del XML (creado en v6.88.x) asume que existe.

## Solución

Migración para agregar la columna faltante en `public.supplier_bills`:

```sql
ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS cfdi_xml_url text;
```

Notas:
- Idempotente con `IF NOT EXISTS`.
- No requiere cambios de RLS/GRANT (heredados de la tabla).
- No se toca `cfdi_pdf_url` porque el flujo de proveedores solo sube el XML; los tipos generados se regeneran tras la migración.

## Changelog

Patch `v6.89.2` en `public/changelog.json` + `public/changelog/v6.89.2.json`: "Fix: columna cfdi_xml_url faltante en supplier_bills impedía guardar facturas de proveedor importadas desde XML."