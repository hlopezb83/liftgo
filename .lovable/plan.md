# Reorganización del Sidebar

Reagrupar los 28 módulos del sidebar en grupos coherentes por dominio, alinear nombres con la tabla `role_permissions`, y cerrar los huecos de mapeo que causan bugs de `NoAccess`.

## 1. Nueva estructura de grupos

```text
General
  • Panel              /
  • Calendario         /calendar

Comercial
  • CRM                /crm
  • Clientes           /customers
  • Cotizaciones       /quotes
  • Contratos          /contracts    (movido desde Operaciones)
  • Reservas           /bookings

Operaciones
  • Entregas           /deliveries
  • Devoluciones       /returns

Flota y Mantenimiento
  • Equipos            /fleet
  • Mantenimiento      /maintenance
  • Daños              /damage
  • Refacciones        /inventory

Finanzas                        (NUEVO)
  • Facturas           /invoices              (movido desde Operaciones)
  • Cuentas por Pagar  /cuentas-por-pagar
  • Proveedores        /suppliers             (movido desde Administración)
  • Flujo de Caja      /flujo-de-caja
  • Cuentas Bancarias  /cuentas-bancarias
  • Conciliación       /conciliacion-bancaria
  • Estado de Resultados /income-statement

Reportes y Análisis             (NUEVO)
  • Reportes           /reports
  • MRR / Métricas     /mrr                   (nuevo en sidebar; ya existe ruta)

Comunidad
  • Mis Reportes       /mis-reportes
  • Tabla de Honor     /leaderboard
  • Gestión de Feedback /feedback

Sistema                         (renombrado desde "Administración")
  • Usuarios           /users
  • Configuración      /settings/operations
  • Actividad          /activity
  • Bitácora           /audit
  • Historial de Imports /conciliacion-bancaria/historial
  • Changelog          /changelog
  • Ayuda              /help
```

## 2. Correcciones de nombres y mapeo de permisos

**Agregar a `MODULES` y `ROUTE_TO_MODULE`** (`useRolePermissions.ts`) los módulos hoy sin mapeo, para que `RoleGuard` no bloquee con `NoAccess`:

- `"Cuentas por Pagar"` → `/cuentas-por-pagar`, `/cuentas-por-pagar/antiguedad`
- `"Flujo de Caja"` → `/flujo-de-caja`
- `"Cuentas Bancarias"` → `/cuentas-bancarias`
- `"Conciliación Bancaria"` → `/conciliacion-bancaria`, `/conciliacion-bancaria/historial`
- `"MRR"` → `/mrr`

Actualizar `appRoutes` en `routes-config.tsx` para que cada ruta apunte a su módulo real (no al genérico "Cuentas por Pagar" o "Reportes").

**Eliminar de `MODULES`** la entrada huérfana `"Pagos"` (no tiene ruta).

## 3. Migración de `role_permissions`

Insertar las filas faltantes para cada `app_role` con el `access_level` default que corresponda (admin = full, resto = read/none según rol), siguiendo el patrón existente. Solo INSERT con `ON CONFLICT DO NOTHING`; no modifica los permisos ya configurados.

## 4. Detalles técnicos

- Archivos a editar:
  - `src/layouts/sidebar/navConfig.ts` — reescribir `NAV_GROUPS`, ajustar `ALWAYS_VISIBLE_ROUTES`.
  - `src/features/users/hooks/useRolePermissions.ts` — agregar entradas a `MODULES` y `ROUTE_TO_MODULE`, quitar `"Pagos"`.
  - `src/lib/routes-config.tsx` — corregir `module:` en rutas de tesorería/MRR.
  - Migración SQL nueva — seed de `role_permissions` para los nuevos módulos.
  - `public/changelog.json` + `public/changelog/v6.37.0.json` — entrada minor.

- Sin cambios en lógica de negocio, solo presentación, configuración de permisos y mapeo.
- Mantiene los íconos actuales; solo se reordenan y dos nuevos grupos reciben sus propios encabezados.

## 5. Fuera de alcance

- No se rediseña `SidebarNavSection` ni el comportamiento collapsible.
- No se tocan rutas del portal cliente.
- No se modifican los valores actuales de permisos por rol (solo se agregan filas faltantes).
