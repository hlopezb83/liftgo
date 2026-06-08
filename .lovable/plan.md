
# Alta de Proveedores vía CSF

Replicar el flujo de "Importar desde CSF" que ya existe en Clientes para el diálogo de Proveedores, reutilizando el edge function `parse-csf` y el hook `useParseCsf`.

## Cambios

### 1. `SupplierFormDialog.tsx`
- Envolver el formulario en `Tabs` (solo al crear, no al editar) con dos pestañas:
  - **Llenar manualmente** (actual)
  - **Importar desde CSF** (nuevo dropzone + formulario para revisar/editar)
- Al editar un proveedor existente, mantener el formulario directo sin tabs (igual que clientes).

### 2. Nuevo componente `SupplierCsfDropzone.tsx`
- Mismo patrón que `CsfDropzone` de clientes: drag-and-drop de PDF, llama a `useParseCsf`, devuelve los datos parseados al diálogo.
- Reutiliza `useParseCsf` (sin cambios — el edge function `parse-csf` ya está protegido y devuelve los campos necesarios).

### 3. Mapeo de campos CSF → `SupplierForm`
Los campos del CSF se mapean al formulario de proveedor así:

| Campo CSF | Campo Proveedor |
|---|---|
| `name` / `razon_social` | `name` |
| `rfc` | `rfc` |
| `regimen_fiscal` | `regimen_fiscal` |
| `address` | `address` |
| `representante_legal` | `contact_person` (solo si está vacío) |

Campos no presentes en CSF (`email`, `phone`, `website`, `category`, `notes`) quedan vacíos para llenar manualmente.

### 4. Permisos del edge function
`parse-csf` ya acepta los roles `admin`, `administrativo`, `dispatcher`, `ventas`. Confirmar que los roles que dan de alta proveedores estén incluidos; si falta alguno, agregarlo.

### 5. Changelog
Agregar entrada nueva en `public/changelog.json` + archivo `public/changelog/v{X.Y.Z}.json` (patch o minor según criterio) describiendo la nueva capacidad.

## Detalles técnicos

- No se requiere migración de BD ni cambios en `suppliers` schema (todos los campos extraídos ya existen).
- El edge function `parse-csf` se reutiliza tal cual.
- El dropzone nuevo puede vivir en `src/features/suppliers/components/suppliers/SupplierCsfDropzone.tsx` (o factorizar `CsfDropzone` a un componente genérico en `src/components/` si prefieres reutilización máxima — confirmar preferencia).

## Pregunta abierta

¿Prefieres (a) duplicar `CsfDropzone` dentro de suppliers para mantener cada feature autocontenida, o (b) extraer un `CsfDropzone` genérico compartido en `src/components/` y que tanto clientes como proveedores lo usen?
