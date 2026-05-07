## Objetivo
Cambiar la acción "Resetear contraseña" para que el admin **escriba la nueva contraseña** en lugar de que el sistema genere una aleatoria automáticamente.

## Flujo nuevo
1. Admin hace clic en el ícono de llave (KeyRound) junto a un usuario.
2. Se abre un diálogo `SetPasswordDialog` con:
   - Nombre/email del usuario destino (contexto visible).
   - Campo "Nueva contraseña" (con toggle mostrar/ocultar, mínimo 6 caracteres).
   - Campo "Confirmar contraseña".
   - Botón opcional "Generar contraseña segura" (rellena ambos campos con una sugerencia, sin enviarla automáticamente).
   - Botones Cancelar / Guardar.
3. Al guardar, se valida (longitud, coincidencia) y se envía al backend.
4. Toast de éxito: "Contraseña actualizada para {email}". El admin la comparte con el usuario por su canal preferido.

## Cambios técnicos

### Backend — `supabase/functions/reset-user-password/index.ts`
- Aceptar opcionalmente `new_password` en el body además de `user_id`.
- Validar: string, longitud mínima 6, máxima 72 (límite de bcrypt/Supabase).
- Si `new_password` está presente → usar esa.
- Si no viene → conservar comportamiento actual (genera aleatoria) para no romper otros llamadores.
- Mantener verificación admin con `getClaims` + `has_role`.
- Respuesta: `{ success: true, email }` (no devolver la contraseña).

### Hook — `src/hooks/useUserManagement.ts`
- `useResetPassword`: cambiar firma a `mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string })` y pasar `new_password` en el body.
- Toast de éxito: "Contraseña actualizada para {email}".

### UI nuevo — `src/components/users/SetPasswordDialog.tsx`
- Props: `user: UserRow | null`, `onClose()`.
- Estado local: `password`, `confirm`, `showPassword`.
- Validaciones con `sonner` (siguiendo el patrón global de manejo de errores).
- Botón "Generar segura" con util local (mismo charset que el edge function).
- Llama a `useResetPassword().mutateAsync({ userId, newPassword })` y cierra al éxito.

### `src/pages/UserManagementPage.tsx`
- Reemplazar `handleResetPassword` por `setPasswordTarget` state.
- Los dos botones KeyRound (tabla + mobile card) abren el diálogo en lugar de llamar a `mutateAsync` directamente.
- Renderizar `<SetPasswordDialog user={setPasswordTarget} onClose={() => setPasswordTarget(null)} />`.
- Quitar el uso de `resetPassword.isPending` para deshabilitar los botones (ya no aplica, el diálogo maneja el estado).

### Changelog
- `public/changelog/v5.59.11.json` (patch): "Reseteo de contraseña ahora permite al admin definir manualmente la nueva contraseña."
- Agregar entrada al inicio de `public/changelog.json`.

## Notas
- No se cambia RLS ni esquema de DB.
- El diálogo `CredentialsDialog` existente queda igual (se sigue usando para creación de usuarios).
- HIBP sigue activo en Supabase Auth, así que contraseñas filtradas serán rechazadas por el backend con mensaje claro vía toast.
