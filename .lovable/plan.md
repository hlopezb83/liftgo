

# Plan: Módulo de Proveedores

## Resumen
Crear un módulo completo de Proveedores integrado al ERP, vinculado a gastos operativos y mantenimiento para rastrear a quién se le paga y quién da servicio.

## 1. Base de datos

### Tabla `suppliers`
```sql
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  website text,
  address text,
  rfc text,
  regimen_fiscal text,
  category text, -- refacciones, mantenimiento, combustible, transporte, otro
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
```

RLS: lectura para todos los roles autenticados, escritura para admin/administrativo. Trigger `update_updated_at_column`.

### Vincular proveedores a gastos y mantenimiento
- `ALTER TABLE operating_expenses ADD COLUMN supplier_id uuid REFERENCES suppliers(id);`
- `ALTER TABLE maintenance_logs ADD COLUMN supplier_id uuid REFERENCES suppliers(id);`

Esto permite saber qué proveedor generó cada gasto o servicio de mantenimiento.

## 2. Código nuevo

### `src/hooks/useSuppliers.ts`
Hook con `useSuppliers`, `useCreateSupplier`, `useUpdateSupplier` — mismo patrón que `useCustomers`.

### `src/lib/formSchemas.ts`
Agregar `supplierFormSchema` con campos: name (requerido), contact_person, email, phone, website, address, rfc, regimen_fiscal, category, notes.

### `src/pages/SuppliersPage.tsx`
Réplica simplificada de `CustomersPage`:
- Tabla con columnas: Nombre, RFC, Categoría, Correo, Teléfono
- Dialog para crear/editar con secciones: Identidad, Datos Fiscales (solo RFC y Régimen), Contacto, Notas
- Búsqueda, ordenamiento, paginación, export CSV, mobile cards

### `src/pages/SupplierDetailPage.tsx`
Detalle simplificado:
- Card de contacto (nombre, email, teléfono, dirección, website, RFC)
- Card de notas
- Lista de gastos operativos vinculados al proveedor
- Lista de registros de mantenimiento vinculados al proveedor

## 3. Routing y navegación

### `src/App.tsx`
- `/suppliers` → SuppliersPage (roles: admin, administrativo, auditor)
- `/suppliers/:id` → SupplierDetailPage (mismos roles)

### `src/components/AppSidebar.tsx`
Agregar "Proveedores" en el grupo "Administración" con icono `Truck` y roles: admin, administrativo, auditor.

## 4. Integración con módulos existentes

### Gastos Operativos (`OperatingExpensesPage`)
- Agregar selector opcional de proveedor en el formulario de gastos
- Mostrar nombre del proveedor en la tabla de gastos

### Mantenimiento (`MaintenancePage`)
- Agregar selector opcional de proveedor en el formulario de mantenimiento
- Mostrar nombre del proveedor cuando aplique

## 5. Changelog
Entrada v3.23.0: Nuevo módulo de Proveedores con vinculación a gastos y mantenimiento.

## Archivos a crear/modificar
- **Crear**: `src/hooks/useSuppliers.ts`, `src/pages/SuppliersPage.tsx`, `src/pages/SupplierDetailPage.tsx`
- **Modificar**: `src/lib/formSchemas.ts`, `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/lib/changelog.ts`
- **Modificar** (integración): `src/hooks/useOperatingExpenses.ts`, `src/pages/OperatingExpensesPage.tsx` o su dialog, `src/hooks/useMaintenanceLogs.ts`
- **Migración DB**: tabla suppliers + columnas supplier_id en operating_expenses y maintenance_logs

