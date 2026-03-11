

# Nuevo Rol: Ventas

## Perfil del Rol
El rol "Ventas" es un perfil comercial enfocado en la gestión de clientes, cotizaciones y seguimiento de prospectos. No necesita acceso a operaciones internas (mantenimiento, refacciones, gastos) ni a configuración del sistema.

## Permisos Sugeridos

### Acceso completo (leer + crear + editar)
- **CRM / Prospectos** -- su herramienta principal de trabajo
- **Clientes** -- gestionar cartera de clientes
- **Cotizaciones** -- crear y dar seguimiento a cotizaciones

### Acceso de solo lectura
- **Panel / Dashboard** -- ver métricas generales
- **Calendario** -- ver disponibilidad de equipos
- **Equipos (Flota)** -- consultar inventario y especificaciones para cotizar
- **Reservas** -- ver estado de reservas de sus cotizaciones
- **Reportes** -- consultar reportes comerciales
- **Actividad** -- ver feed de actividad

### Sin acceso
- Contratos, Entregas, Devoluciones (operaciones)
- Facturas, Pagos (administrativo/contable)
- Mantenimiento, Daños, Refacciones (flota/técnico)
- Proveedores, Gastos Operativos, Estado de Resultados (finanzas)
- Configuración, Datos Fiscales, Usuarios (administración)

## Cambios Técnicos

### 1. Base de datos
Agregar `'ventas'` al enum `app_role` y crear RLS policies en las tablas relevantes:
- **Full access**: `customers`, `prospects`, `quotes`
- **Read-only**: `forklifts`, `equipment_models`, `bookings`, `activity_feed`, `audit_logs`

### 2. `src/lib/constants.ts`
Agregar a `STAFF_ROLES`, `ROLE_LABELS` (Ventas), `ROLE_COLORS` (color sugerido: índigo/teal).

### 3. `src/hooks/useUserRole.ts`
Agregar `"ventas"` a la lista de prioridad de roles.

### 4. `src/components/AppSidebar.tsx`
Incluir `"ventas"` en los arrays de roles de los items del sidebar:
- CRM, Clientes, Cotizaciones, Reservas (lectura), Calendario, Reportes

### 5. `src/App.tsx`
Agregar `"ventas"` a las rutas permitidas:
- `/crm`, `/customers`, `/customers/:id`, `/quotes/*`, `/bookings` (solo lectura), `/reports`, `/audit`, `/calendar`

### 6. `src/lib/changelog.ts`
Registrar en nueva versión.

## Resumen de Color
Ventas: `bg-teal-600 text-white` (diferenciado de los demás roles)

