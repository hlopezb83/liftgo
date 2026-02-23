
# Crear y eliminar usuarios desde Gestion de Usuarios

## Situacion actual

- **Crear**: El formulario "Invitar Usuario" ya existe y funciona via edge function (`invite-user`). Sin embargo, genera una contrasena temporal aleatoria que no se comunica al administrador ni al usuario. El admin necesita poder establecer una contrasena directamente.
- **Eliminar**: No existe funcionalidad para eliminar usuarios. Se necesita una edge function con `service_role` para borrar la cuenta de autenticacion y los datos asociados.

## Cambios

### 1. Edge Function: `delete-user` (nuevo)

Crear una nueva edge function que:
- Verifique que el llamador es admin (mismo patron que `invite-user`)
- Impida que un admin se borre a si mismo
- Elimine el perfil de `profiles` y el rol de `user_roles`
- Elimine la cuenta de autenticacion via `adminClient.auth.admin.deleteUser()`

### 2. Edge Function: `invite-user` (modificar)

- Aceptar un campo opcional `password` en el body
- Si se proporciona, usar esa contrasena en lugar de la temporal aleatoria
- Si no se proporciona, mantener el comportamiento actual (contrasena temporal)

### 3. Frontend: `UserManagementPage.tsx`

**Formulario de crear usuario:**
- Agregar campo "Contrasena" al dialog existente de invitar usuario
- El admin escribe la contrasena que le dara al nuevo usuario
- Validar que tenga al menos 6 caracteres

**Boton de eliminar:**
- Agregar columna "Acciones" a la tabla
- Mostrar boton de eliminar (icono Trash2) en cada fila
- No mostrar el boton en la fila del usuario actualmente logueado (no puede borrarse a si mismo)
- Al hacer clic, mostrar un `AlertDialog` de confirmacion con el nombre del usuario
- Al confirmar, llamar a la edge function `delete-user`

### 4. Flujo de eliminacion

```text
Admin hace clic en Eliminar
       |
       v
AlertDialog: "Eliminar a [nombre]?"
       |
       v (Confirmar)
Edge Function delete-user
       |
       +-- Verifica admin
       +-- Borra user_roles
       +-- Borra profiles  
       +-- Borra auth.users
       |
       v
Refresca lista de usuarios
```

## Detalles tecnicos

**`supabase/functions/delete-user/index.ts`**: Nueva edge function. Usa el mismo patron de autenticacion que `invite-user` (verificar caller via anon key, verificar rol admin via service role, ejecutar accion administrativa).

**`supabase/functions/invite-user/index.ts`**: Agregar `password` como campo opcional del body. Si se incluye, usarlo como contrasena del nuevo usuario.

**`src/pages/UserManagementPage.tsx`**:
- Nuevo hook `useDeleteUser` con mutation que invoca `delete-user`
- Campo `password` en el estado del dialog de creacion
- Columna "Acciones" con boton de eliminar y AlertDialog de confirmacion
- Usar `useAuth` para obtener el `user.id` actual y ocultar el boton de eliminar en su propia fila
