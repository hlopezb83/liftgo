## Objetivo
Unificar **Nombre** y **Razón Social** del cliente en un solo campo, tanto al crear como al editar. Hoy el formulario muestra ambos y son redundantes.

## Cambios

### 1. UI del formulario de cliente
- **`FiscalSection.tsx`**: eliminar el `FormField` de `razon_social`. La sección "Datos Fiscales (CFDI)" sigue mostrando RFC, C.P. Fiscal, Régimen Fiscal y Uso CFDI.
- **`IdentitySection.tsx`**: cambiar el label de "Nombre / Empresa *" a **"Nombre / Razón Social *"** y actualizar el placeholder a uno que refleje cómo aparece en la CSF (ej: `MONTACARGAS DEL NORTE`).

### 2. Schema y payload
- **`customerFormSchema.ts`**: quitar `razon_social` del schema y del tipo `CustomerFormData`.
- **`CustomerFormDialog.tsx`**: quitar `razon_social` de `emptyCustomer`.
- **`customerPayload.ts`**: sacar `razon_social` de `NULLABLE_FIELDS` y en el payload final asignar `razon_social: form.name`. Esto mantiene la columna `customers.razon_social` poblada con el mismo valor que `name`, de modo que toda la lógica existente que lee `customer.razon_social` (timbrado CFDI, PDFs, snapshots de facturas, contratos) sigue funcionando sin cambios.

### 3. Importación desde CSF
- **`CsfDropzone.tsx`**: el edge function `parse-csf` devuelve tanto `name` como `razon_social`. Mapear ambos al campo único `name` con preferencia `data.name ?? data.razon_social`, y no enviar `razon_social` en el patch.

## Fuera de alcance
- No se toca la columna `razon_social` de la tabla `customers` (se mantiene por compatibilidad con facturas históricas y snapshots).
- No se modifica `company_settings.razon_social` (es la razón social de la empresa emisora, distinta a la del cliente).
- No se cambia el comportamiento del timbrado CFDI ni del PDF; siguen leyendo `customer.razon_social || customer.name`, que ahora siempre coincidirán.
- No se toca la UI ni schema de proveedores ni de operaciones.

## Detalles técnicos
- Archivos editados:
  - `src/features/customers/components/customers/customerSections/IdentitySection.tsx`
  - `src/features/customers/components/customers/customerSections/FiscalSection.tsx`
  - `src/features/customers/lib/customerFormSchema.ts`
  - `src/features/customers/lib/customerPayload.ts`
  - `src/features/customers/components/customers/CustomerFormDialog.tsx`
  - `src/features/customers/components/customers/CsfDropzone.tsx`
- Verificar tests: `src/features/customers/lib/__tests__/customerFormSchema.test.ts` — actualizar si referencia `razon_social`.
- Changelog: nueva entrada `v6.80.4` (patch — simplificación de UX sin cambio de comportamiento).
