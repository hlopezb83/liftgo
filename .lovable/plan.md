

# Eliminar opcion de registro publico

## Problema
La pagina de login muestra un enlace "No tienes cuenta? Registrate" que permite a cualquier persona crear una cuenta. Esto no es correcto porque solo el administrador puede dar de alta nuevos usuarios (via invitacion).

## Cambios

**Archivo: `src/pages/AuthPage.tsx`**

1. Eliminar el estado `fullName` y el modo `"sign-up"` del tipo `Mode`
2. Eliminar el bloque del formulario que muestra el campo "Nombre Completo" cuando `mode === "sign-up"`
3. Eliminar el boton "Registrarse" y el enlace "No tienes cuenta? Registrate"
4. Eliminar la entrada `"sign-up"` del objeto `titles`
5. Eliminar la referencia a `signUp` del hook `useAuth`

El formulario quedara solo con tres modos: `sign-in`, `forgot` y `reset`.

