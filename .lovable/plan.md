

## Seguridad de contraseñas: Crypto seguro + eliminar contraseña del response

### Contexto

Ambas Edge Functions (`invite-user`, `reset-user-password`) usan `crypto.randomUUID()` para generar contraseñas y las devuelven en texto plano al frontend. El frontend las muestra en un `CredentialsDialog` para copiar. El usuario quiere:

1. Usar `crypto.getRandomValues()` (Web Crypto API) para passwords criptográficamente seguros
2. Eliminar la contraseña del JSON de respuesta — confiar en el sistema de email de autenticación

### Impacto en el frontend

Al dejar de devolver la contraseña, el `CredentialsDialog` ya no tiene sentido en su forma actual. El flujo cambia a:
- **Invitar usuario**: Se crea el usuario y se muestra un toast de confirmación indicando que el usuario recibirá un correo para establecer su contraseña
- **Reset de contraseña**: Se resetea y se muestra un toast confirmando que se envió un enlace de restablecimiento por correo

### Cambios

**1. `supabase/functions/invite-user/index.ts`**
- Reemplazar `crypto.randomUUID() + "Aa1!"` por una función que use `crypto.getRandomValues()` con charset alfanumérico + símbolos (20 chars)
- Eliminar `password` del response final: devolver solo `{ success: true, user_id, email }`
- Mantener la validación de password del body (cuando el admin la especifica manualmente)

**2. `supabase/functions/reset-user-password/index.ts`**
- Reemplazar `crypto.randomUUID().slice(0,12) + "Aa1!"` por la misma función con `crypto.getRandomValues()`
- Eliminar `password` del response: devolver solo `{ success: true, email }`

**3. `src/hooks/useUserManagement.ts`**
- `useInviteUser`: El `mutationFn` ya no recibe password en la respuesta
- `useResetPassword`: Cambiar el tipo de retorno de `{ email: string; password: string }` a `{ email: string }`, mostrar toast de éxito directamente en `onSuccess`

**4. `src/components/users/InviteUserDialog.tsx`**
- Cambiar `onCreated` callback: ya no pasa credenciales, solo notifica que se creó exitosamente
- Mostrar toast: "Usuario creado. Recibirá un correo para establecer su contraseña."

**5. `src/components/users/CredentialsDialog.tsx`**
- Simplificar: solo muestra el email del usuario creado con un mensaje de que recibirá instrucciones por correo
- Eliminar el campo de contraseña y la advertencia de "no se podrá consultar después"

**6. `src/pages/UserManagementPage.tsx`**
- Actualizar `handleResetPassword` para mostrar toast en vez de abrir dialog con credenciales
- Simplificar el tipo de `createdCredentials` (ya no incluye password)

**7. `src/lib/changelog.ts`** — Nueva entrada v5.13.1

### Función de generación segura (compartida en ambas Edge Functions)

```typescript
function generateSecurePassword(length = 20): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => charset[v % charset.length]).join("");
}
```

### Archivos modificados
- `supabase/functions/invite-user/index.ts`
- `supabase/functions/reset-user-password/index.ts`
- `src/hooks/useUserManagement.ts`
- `src/components/users/InviteUserDialog.tsx`
- `src/components/users/CredentialsDialog.tsx`
- `src/pages/UserManagementPage.tsx`
- `src/lib/changelog.ts`

