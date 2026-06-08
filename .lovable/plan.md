## Objetivo

Permitir extraer datos del CSF también al editar un proveedor existente, no solo al crearlo.

## Cambios

**`src/features/suppliers/components/suppliers/SupplierFormDialog.tsx`**
- Quitar la rama condicional que oculta los tabs cuando hay `supplier`. Mostrar siempre las pestañas "Llenar manualmente" e "Importar desde CSF".
- En modo edición, los campos del formulario ya estarán pre-cargados con los datos actuales del proveedor. Al soltar un CSF en la pestaña de importación, `handleCsfParsed` hará merge sobre los datos existentes: solo sobrescribe campos cuyo valor del CSF no esté vacío (comportamiento ya implementado), preservando datos manuales como teléfono, email, categoría, etc.
- Ajustar el reset de `tab` en el `useEffect` para que también se reinicie a `"manual"` al abrir en modo edición.

**Changelog** — entrada `6.25.2` (patch): "Importar CSF también al editar un proveedor existente."

## Notas técnicas

- Sin cambios de backend ni de hooks; `useUpdateSupplier` ya acepta todos los campos fiscales.
- Sin cambios en `SupplierCsfDropzone` ni en `useParseCsf`.
