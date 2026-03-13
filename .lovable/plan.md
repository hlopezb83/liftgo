

## Permisos Dinámicos por Rol (Opción B)

### Contexto
Actualmente los permisos son estáticos: están codificados en `ROLE_PERMISSIONS` (frontend) y en las políticas RLS (base de datos). El objetivo es permitir que un admin edite qué módulos puede ver cada rol desde la UI.

### Alcance importante
Los permisos dinámicos controlarán la **visibilidad en el frontend** (sidebar, guards, matriz). Las **políticas RLS en la base de datos** seguirán siendo la capa de seguridad real — estas no se pueden modificar dinámicamente desde la app sin riesgos de seguridad. Si un admin quita acceso a "Facturas" para el rol Despachador, ese rol dejará de ver el menú y las páginas, pero el RLS sigue siendo el candado real a nivel de datos.

### Cambios

**1. Nueva tabla `role_permissions`**
- Columnas: `id`, `role` (app_role), `module` (text), `access_level` (text: 'full' | 'read' | 'none')
- Constraint unique en `(role, module)`
- RLS: solo admin puede escribir, todos los autenticados pueden leer
- Seed con los valores actuales de `ROLE_PERMISSIONS`

**2. Nuevo hook `useRolePermissions`**
- Consulta la tabla `role_permissions` con TanStack Query
- Expone un mapa `Record<AppRole, Record<string, 'full' | 'read' | 'none'>>`
- Mutación para actualizar un permiso individual

**3. Página de permisos editable (`RolePermissionsPage.tsx`)**
- Los iconos (check/eye/minus) se vuelven botones clickeables que ciclan entre los 3 niveles
- Solo editable para admins; otros roles ven la matriz en modo lectura
- Guardar cambios por celda con feedback visual (toast)
- Admin siempre tiene acceso completo (celdas no editables)

**4. Sidebar dinámico (`AppSidebar.tsx`)**
- Reemplazar el filtrado estático por `roles` con los permisos dinámicos
- Si `access_level === 'none'` para un módulo/rol, el item no se muestra
- Mapeo entre nombres de módulo en la tabla y rutas del sidebar

**5. RoleGuard dinámico**
- Actualizar `RoleGuard` para consultar permisos dinámicos además de la lista estática de roles permitidos

**6. Changelog v3.40.0**

### Archivos afectados
- Nueva migración SQL (tabla + seed)
- `src/hooks/useRolePermissions.ts` (nuevo)
- `src/pages/RolePermissionsPage.tsx` (editable)
- `src/components/AppSidebar.tsx` (permisos dinámicos)
- `src/components/RoleGuard.tsx` (permisos dinámicos)
- `src/components/RolePermissionsMatrix.tsx` (sincronizar)
- `src/lib/changelog.ts`

