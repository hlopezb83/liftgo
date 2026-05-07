## Diagnóstico

Los logs de Auth muestran que el endpoint `PUT /admin/users/{id}` devolvió **422 Unprocessable Entity** dos veces seguidas al intentar resetear la contraseña de `comercial@liftgo.com.mx`. Causa: la contraseña ingresada fue rechazada por las políticas de seguridad de Supabase Auth (HIBP — pwned passwords está habilitado en este proyecto, además de validación de longitud/complejidad mínima).

La edge function `reset-user-password` se ejecutó correctamente; el error viene de Supabase Auth. Hoy el mensaje se reenvía como `updateErr.message`, pero en el toast aparece como un texto técnico poco accionable, y el diálogo se queda en estado "Guardando…" sin orientar al admin.

## Cambios propuestos (v5.59.12 — patch)

### 1. `supabase/functions/reset-user-password/index.ts`
- Detectar errores conocidos de Auth y mapearlos a mensajes claros en español:
  - `weak_password` / "Password should be at least…" → "Contraseña demasiado débil. Usa al menos 8 caracteres con mayúsculas, números y símbolos."
  - "pwned" / "leaked" / "compromised" → "Esta contraseña aparece en filtraciones públicas conocidas. Elige otra diferente."
  - cualquier otro 422 → mensaje original.
- Devolver además `code: "weak_password" | "pwned" | "other"` en el JSON para que el frontend pueda reaccionar.
- Status code: mantener 400 (lo que ya consume el hook).

### 2. `src/components/users/SetPasswordDialog.tsx`
- Capturar el error en `handleSubmit` (sin depender solo del toast del hook): mostrar un bloque inline rojo debajo del campo de contraseña con el mensaje devuelto, para que el admin lo vea sin que desaparezca como el toast.
- Limpiar el error al modificar el campo.
- Al pulsar "Generar contraseña segura" se garantiza una contraseña aleatoria larga (ya cumple HIBP), así que ese botón sigue siendo el escape rápido.
- Agregar texto de ayuda visible: "Mínimo 8 caracteres. No se aceptan contraseñas comunes o filtradas (HIBP)."

### 3. `src/hooks/useUserManagement.ts`
- En `useResetPassword.onError`, además del toast actual agregar `description: err.message` completo para que se vea el motivo real.
- Re-lanzar el error (ya lo hace vía `mutateAsync`) para que el diálogo lo capture inline.

### 4. Changelog
- Crear `public/changelog/v5.59.12.json` y agregar entrada al inicio de `public/changelog.json`:
  - "Mejor manejo de errores al asignar contraseña: ahora se explica claramente cuándo es débil o aparece en filtraciones (HIBP)."

## Notas
- No se cambia la política HIBP de Supabase Auth — se mantiene activa porque protege a los usuarios.
- No se modifica RLS ni esquema de DB.
- El diálogo `CredentialsDialog` (creación) no se toca.
