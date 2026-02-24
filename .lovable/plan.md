

# Implementar rol de Auditor (solo lectura)

## Descripcion
Se agrega un nuevo rol "auditor" al sistema. Este usuario puede ver absolutamente toda la informacion (equivalente a un admin en lectura), pero no puede crear, editar ni eliminar nada.

## Cambios necesarios

### 1. Base de datos - Migracion SQL

**Agregar valor al enum `app_role`:**
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';
```

**Agregar politicas RLS de solo lectura (SELECT) para auditor en todas las tablas:**
- `forklifts`, `bookings`, `invoices`, `contracts`, `quotes`, `customers`, `deliveries`, `return_inspections`, `maintenance_logs`, `damage_records`, `payments`, `status_logs`, `documents`, `drivers`, `mechanics`, `equipment_models`, `company_settings`, `activity_feed`, `audit_logs`, `profiles`, `user_roles`

Cada politica sera del tipo:
```sql
CREATE POLICY "Auditor read <tabla>"
ON public.<tabla> FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'auditor'));
```

### 2. Frontend - Tipo y prioridad de roles

**`src/hooks/useUserRole.ts`:**
- Agregar `"auditor"` al tipo `AppRole`
- Agregar `"auditor"` a la lista de prioridad (despues de administrativo, antes de mechanic)

### 3. Frontend - Navegacion (Sidebar)

**`src/components/AppSidebar.tsx`:**
- Agregar `"auditor"` a todos los arrays de `roles` en los items del menu para que pueda ver todas las secciones
- Esto incluye: Cotizaciones, Reservas, Contratos, Entregas, Devoluciones, Facturas, Bitacora, Reportes, Configuracion, Datos Fiscales y Usuarios

### 4. Frontend - Rutas (App.tsx)

**`src/App.tsx`:**
- Agregar `"auditor"` a los arrays `roles` de todas las rutas de **consulta** (listados y detalle)
- **No agregar** auditor a rutas de creacion/edicion (`/fleet/new`, `/fleet/:id/edit`, `/invoices/new`, `/invoices/:id/edit`, `/bookings/new`, `/quotes/new`, `/quotes/:id/edit`, `/contracts/new`, `/contracts/:id/edit`)
- Si agregar a rutas de detalle: `/invoices/:id`, `/contracts/:id`, `/quotes/:id`, etc.
- Agregar a `/users` y `/settings/company` y `/settings/operations` en modo solo lectura

### 5. Frontend - Gestion de Usuarios

**`src/pages/UserManagementPage.tsx`:**
- Agregar `"auditor"` a `STAFF_ROLES`, `ROLE_LABELS` (label: "Auditor") y `ROLE_COLORS` (color: morado/purple)
- Esto permite al admin asignar el rol de auditor a otros usuarios

### 6. Edge Functions - Validacion

**`supabase/functions/_shared/validate.ts`:**
- Agregar `"auditor"` al array de roles validos en `isValidRole`

**`supabase/functions/invite-user/index.ts`:**
- Ya usa `isValidRole`, asi que con actualizar validate.ts es suficiente

**`supabase/functions/generate-invoice-pdf/index.ts`:**
- Agregar `"auditor"` a la lista de roles staff para que pueda ver PDFs de facturas

### 7. AuthGuard

**`src/components/AuthGuard.tsx`:**
- No requiere cambios: el auditor no es "customer", asi que entra al flujo normal del ERP

## Resumen de acceso del Auditor

| Seccion | Ver | Crear/Editar/Eliminar |
|---------|-----|----------------------|
| Panel | Si | No |
| Calendario | Si | No |
| Clientes | Si | No |
| Cotizaciones | Si | No |
| Reservas | Ver calendario | No puede crear |
| Contratos | Si | No |
| Entregas | Si | No |
| Devoluciones | Si | No |
| Facturas | Si | No |
| Equipos | Si | No |
| Mantenimiento | Si | No |
| Danos | Si | No |
| Actividad | Si | No |
| Bitacora | Si | No |
| Reportes | Si | No |
| Configuracion | Si | No |
| Datos Fiscales | Si | No |
| Usuarios | Si | No |

## Archivos a modificar
- Nueva migracion SQL (agregar enum + ~20 politicas RLS)
- `src/hooks/useUserRole.ts`
- `src/components/AppSidebar.tsx`
- `src/App.tsx`
- `src/pages/UserManagementPage.tsx`
- `supabase/functions/_shared/validate.ts`
- `supabase/functions/generate-invoice-pdf/index.ts`

