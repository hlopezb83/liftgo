

# Robustecimiento del Módulo de Gestión de Usuarios

## Estado Actual

El módulo actual permite:
- Listar usuarios con nombre, fecha de registro y rol
- Crear usuarios con nombre, email, contraseña y rol
- Editar nombre
- Cambiar rol (dropdown inline)
- Eliminar usuarios

## Mejoras Propuestas

### 1. Mostrar email de cada usuario
Actualmente no se muestra el correo electrónico en la tabla. Se agregará una columna de email obtenida desde `auth.users` vía la tabla `profiles` (agregar campo `email` al query o almacenarlo en profiles).

### 2. Búsqueda y filtrado
- Barra de búsqueda por nombre o email
- Filtro por rol (dropdown)

### 3. Resetear contraseña de un usuario
- Botón por usuario para generar una nueva contraseña temporal
- Se mostrará en el diálogo de credenciales (como al crear usuario)
- Requiere una nueva Edge Function (`reset-user-password`) que use `adminClient.auth.admin.updateUser()`

### 4. Descripción de permisos por rol
- Al seleccionar un rol (o en un tooltip/popover), mostrar un resumen de los módulos a los que tiene acceso ese rol
- Ayuda visual para que el admin entienda qué permisos otorga cada rol

### 5. Indicador de último acceso
- Agregar campo `last_sign_in` a la vista, obtenido del metadata de auth (o almacenado en profiles vía trigger)
- Mostrar "Último acceso: hace X días" en la tabla

### 6. Estado activo/inactivo
- Agregar campo `is_active` a la tabla `profiles`
- Permitir desactivar un usuario sin eliminarlo (ban/unban vía Edge Function)
- Usuario desactivado no puede iniciar sesión

### 7. Mejoras de UX
- Paginación (ya existe el componente `TablePagination`)
- Badge de "Tú" junto al usuario actual
- Confirmación al cambiar rol (actualmente se cambia sin confirmar)

## Cambios Técnicos

### Base de datos
- Agregar columna `email` y `is_active` (default true) a `profiles`
- Trigger para sincronizar email desde `auth.users` al crear usuario

### Edge Functions
- **`reset-user-password`**: nueva función que genera contraseña temporal y actualiza vía `auth.admin.updateUser()`
- **`toggle-user-status`**: nueva función para ban/unban usuario vía `auth.admin.updateUserById()`

### Frontend
- `src/pages/UserManagementPage.tsx`: refactorizar con búsqueda, filtros, nuevas columnas (email, último acceso, estado), botones de reset password y toggle activo
- Nuevo componente `RolePermissionsTooltip` para mostrar permisos de cada rol
- Agregar confirmación al cambiar rol

### Changelog
- Registrar como versión 3.32.0

## Orden de Implementación
1. Migración DB (email + is_active en profiles, trigger sync email)
2. Edge Functions (reset-password, toggle-status)
3. Frontend: columnas email + estado + último acceso
4. Frontend: búsqueda y filtro por rol
5. Frontend: acciones (reset password, toggle activo, confirmación de cambio de rol)
6. Frontend: tooltip de permisos por rol
7. Changelog

