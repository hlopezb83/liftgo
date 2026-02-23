

# Nuevo rol "Administrativo"

Se creara un nuevo rol llamado **"administrativo"** con permisos para gestionar clientes, cotizaciones, reservas, contratos, entregas, devoluciones, facturas, reportes y bitacora. Las funciones exclusivas de superusuario (gestion de usuarios, configuracion de empresa, configuracion de operaciones) seguiran siendo solo para el rol **"admin"**.

## Permisos del rol Administrativo

| Funcion | Admin | Administrativo | Despachador | Mecanico |
|---------|-------|----------------|-------------|----------|
| Dashboard | Si | Si | Si | Si |
| Calendario | Si | Si | Si | Si |
| Clientes (CRUD) | Si | Si | Si (CRUD) | Solo lectura |
| Cotizaciones | Si | Si | Si | Solo lectura |
| Reservas | Si | Si | Si | Solo lectura |
| Contratos | Si | Si | Si | Solo lectura |
| Entregas | Si | Si | Si | Solo lectura |
| Devoluciones | Si | Si | Si | Solo lectura |
| Facturas | Si | Si | Si | Solo lectura |
| Equipos (CRUD) | Si | Si | Solo lectura | Solo lectura |
| Mantenimiento | Si | Si (lectura) | Si (lectura) | Si (CRUD) |
| Danos | Si | Si | Si | Solo lectura |
| Reportes | Si | Si | Si | No |
| Bitacora | Si | Si | Si | No |
| Actividad | Si | Si | Si | Si |
| Config. Operaciones | Si | No | No | No |
| Datos Fiscales | Si | No | No | No |
| Gestion Usuarios | Si | No | No | No |

## Cambios necesarios

### 1. Base de datos (migracion SQL)

- Agregar `'administrativo'` al enum `app_role`
- Agregar politicas RLS para el nuevo rol en todas las tablas relevantes, replicando los permisos del dispatcher con acceso completo (CRUD) en: bookings, contracts, customers, damage_records, deliveries, documents, invoices, payments, quotes, return_inspections
- Agregar politica de lectura en: forklifts, maintenance_logs, status_logs, activity_feed, audit_logs
- Agregar politica CRUD en: forklifts (para dar de alta/editar equipos)

### 2. Frontend - Tipo y resolucion de rol

**`src/hooks/useUserRole.ts`**:
- Agregar `"administrativo"` al tipo `AppRole`
- Actualizar la prioridad: `admin > customer > administrativo > mechanic > dispatcher`

### 3. Frontend - Rutas y navegacion

**`src/App.tsx`**:
- Agregar `"administrativo"` a las rutas que actualmente permiten `["admin", "dispatcher"]`: cotizaciones, reservas, contratos, entregas, devoluciones, facturas, reportes, bitacora
- Agregar `"administrativo"` a las rutas de flota (crear/editar): `fleet/new`, `fleet/:id/edit`

**`src/components/AppSidebar.tsx`**:
- Agregar `"administrativo"` a los items de navegacion que tienen `roles: ["admin", "dispatcher"]`

### 4. Frontend - Gestion de usuarios

**`src/pages/UserManagementPage.tsx`**:
- Agregar `"administrativo"` a `STAFF_ROLES` y `ROLE_LABELS`

### 5. Edge function - invite-user

**`supabase/functions/invite-user/index.ts`**:
- Agregar `"administrativo"` a la lista `validRoles`

### 6. AuthGuard

No requiere cambios. El rol "administrativo" no es "customer", asi que se redirigira al ERP normal automaticamente.

## Secuencia de implementacion

1. Migracion SQL: agregar valor al enum y crear politicas RLS
2. Actualizar `useUserRole.ts` con el nuevo tipo y prioridad
3. Actualizar `App.tsx` con las rutas permitidas
4. Actualizar `AppSidebar.tsx` con los items de navegacion
5. Actualizar `UserManagementPage.tsx` con el nuevo rol
6. Actualizar `invite-user` edge function

