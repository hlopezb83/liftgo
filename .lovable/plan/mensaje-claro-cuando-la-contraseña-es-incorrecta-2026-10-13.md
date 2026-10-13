# Mensaje claro cuando la contraseña es incorrecta

## Qué pasó
El reporte (13-oct, 10:17 hora CDMX) no es una falla del sistema: alguien escribió un correo o contraseña que no coinciden. Los registros muestran que minutos antes (10:09) se usó un enlace de recuperación de contraseña; un segundo enlace ya estaba vencido. Lo más probable es que la contraseña nueva no se guardó o se escribió distinta.

El problema real es el aviso: dice "No se pudo completar la operación" en vez de "Correo o contraseña incorrectos.", y el usuario no sabe qué hacer. Ya existe la traducción, pero la pantalla de acceso no la usa.

## Cambios
1. Pantalla de acceso: al fallar el inicio de sesión, el aviso dirá "No pudimos iniciar sesión" con el motivo en español (ej. "Correo o contraseña incorrectos.", "Demasiados intentos…"). Lo mismo al fallar el envío del enlace de recuperación o el cambio de contraseña.
2. Prueba puntual que confirme que una contraseña incorrecta muestra el mensaje traducido.
3. Changelogs (versión patch).

## Detalles técnicos
- `src/features/auth/pages/AuthPage.tsx`: `notifyAuthError({ error, title: "No pudimos iniciar sesión", description: getAuthErrorMessage(error) })`; aplicar igual a las ramas de reset/update.
- Revisar que los errores esperados (400/429) sigan sin enviarse a Sentry (ya filtrados en `captureOperationalError`).
- Sin cambios a BD, Auth ni cuentas. Sugerencia operativa: pedir a Eugenio solicitar un enlace nuevo y usarlo una sola vez.
