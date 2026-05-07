# Investigación: por qué el panel de Admin sí muestra "Ventas" pero el usuario ve "Sin permisos"

## Lo que vi en datos
- En `user_roles` ahora **sí existe** la fila para `comercial@liftgo.com.mx` con rol `ventas` (id `1b112dfd-...`). Por eso el panel de Admin muestra "Ventas" — lee `user_roles` correctamente vía `useUserManagement`.
- En `role_permissions`, el rol `ventas` tiene `full` en el módulo **`CRM / Prospectos`**.
- La ruta `/crm` está registrada en `routes-config.tsx` con `module: "CRM / Prospectos"` y el `RoleGuard` global la valida correctamente.

Conclusión: a nivel de datos **el usuario sí debería entrar al CRM**. El error que describe ya no aplica con los datos actuales. Casi seguro está viendo una **sesión cacheada** anterior a la asignación del rol (TanStack Query guarda `["user_role", userId]`; antes devolvió `null` y se mantuvo).

### Por qué Admin ve "Ventas" y el propio usuario no
- **Admin** consulta `user_roles` desde su sesión (con permisos de admin vía RLS) y obtiene la fila fresca cada vez que abre `/users`.
- **El usuario `comercial`** ya estaba logueado cuando aún no tenía rol; su navegador tiene cacheado `user_role = null`. Hasta que **recargue la sesión o cierre/abra**, el `RoleGuard` seguirá creyendo que no tiene rol.

## Qué debe hacer el usuario ahora
1. Pulsar **"Recargar sesión"** en la pantalla de error (botón ya existente, hace `invalidateQueries + reload`), o
2. **Cerrar sesión y volver a iniciar sesión** con `comercial@liftgo.com.mx`.

Tras eso debería entrar al `/crm` sin problema.

## Bug latente que sí conviene corregir (independiente)
En `src/components/crm/ProspectDetailSheet.tsx:130` el botón de eliminar prospecto usa:
```tsx
<RoleGuard module="CRM" minAccess="full">
```
Pero en `role_permissions` el módulo se llama **`CRM / Prospectos`** (no `"CRM"`). Como no existe fila para `"CRM"`, `getAccessLevel` devuelve `"none"` para todos los roles → **el botón de eliminar nunca aparece**, ni siquiera para admin. Lo mismo ocurre en `src/components/inventory/PartDetailSheet.tsx:100` con `module="Inventario"` cuando el módulo real es **`Refacciones`**.

### Fix propuesto
1. `ProspectDetailSheet.tsx`: cambiar `module="CRM"` → `module="CRM / Prospectos"`.
2. `PartDetailSheet.tsx`: cambiar `module="Inventario"` → `module="Refacciones"`.
3. (Defensivo) En `useRolePermissions.ts`: si `module` no existe en la matriz de un rol, loguear `console.warn` en dev para detectar este tipo de typo en el futuro.
4. Changelog `v5.60.1` (patch, fix): documenta los dos botones que no aparecían por nombre de módulo incorrecto.

## Fuera de alcance
- Cambios al RoleGuard de página `/crm` (ya está correcto).
- Cambios a la matriz de permisos en DB.
