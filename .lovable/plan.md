# Bloque 2 Plataforma: qué permite el backend de autenticación (consulta de solo lectura)

No se cambió código, base de datos, autenticación ni configuración, y no se enviaron correos.

## Evidencia observada
- **Sesiones en la BD:** existen 9 filas en `auth.sessions`. Con `has_table_privilege` se comprobó que `authenticated` **y también `service_role` no tienen SELECT** sobre `auth.sessions`. Solo se pudo leer con el rol interno de solo lectura de esta herramienta, no desde la app.
- **`auth.jwt()`:** `authenticated` puede ejecutarla, así que una función SQL puede leer el claim `session_id` del token.
- **Cierre de sesión en la app:** `AuthContext` usa `signOut({ scope: "local" })`, que solo borra el token en el navegador; la sesión no se revoca en el servidor.
- **Recuperación:** se pide desde el navegador con `resetPasswordForEmail`, con `redirectTo` igual a `{origen}/auth`.
- **Invitaciones (usuarios internos y alta de empresas):** se usa `admin.generateLink({ type: "recovery" })` sin `redirectTo`. El enlace se devuelve a quien hizo el alta y **no se envía correo**; el alta de plataforma no lo guarda.
- **Portal de clientes:** usa `generateLink` con `redirectTo` propio.
- **Correos y plantillas:** no hay funciones ni plantillas propias en el repositorio; se usan los correos predeterminados del backend.
- **No verificado:** la URL del sitio, la lista de redirects permitidos y el remitente de correo. No hay herramienta de solo lectura para esos ajustes.

## Capacidades por punto
1. **Sesión vigente ligada a `session_id`.**
   - Posible en teoría con una función `SECURITY DEFINER` (dueño `postgres`) que compare `auth.jwt()->>'session_id'` con `auth.sessions`, expuesta solo a `authenticated` o al servidor.
   - Límite: la app y `service_role` no pueden leer esa tabla directamente.
   - Un token sigue siendo válido por firma hasta que expira, aunque la sesión ya no exista. Solo esa comparación con la BD detecta el cierre o la revocación. `auth.getUser()` revisa el usuario, no confirma que la sesión siga viva.
   - Riesgo: depende de que esa función siga teniendo acceso al esquema `auth` en esta plataforma; hay que probarlo en un entorno de prueba antes de usarlo.
2. **Invitación y recuperación por correo.**
   - Teóricamente se pueden usar `inviteUserByEmail` y `resetPasswordForEmail` con `redirectTo`. La plataforma solo acepta redirects que estén en la lista permitida.
   - Esa lista no pudo verificarse. Hoy solo la recuperación desde el navegador envía correo; las invitaciones entregan el enlace a mano.
   - Para correo con marca propia se necesitaría configurar un dominio de correo.
3. **Revisar la contraseña actual desde el servidor.**
   - Posible en teoría: un cliente de servidor sin persistencia llama `signInWithPassword` y verifica que el usuario devuelto sea el mismo. El navegador conserva su sesión y la contraseña no se guarda.
   - Efecto secundario: cada comprobación **crea una sesión nueva** en el servidor, que hay que cerrar enseguida (`signOut` con ese token). Además cuenta para el límite de intentos.
   - No existe una API para "solo verificar contraseña". La opción de pedir la contraseña actual al cambiarla aplica solo al cambio de contraseña.
4. **Revocar sesiones de un solo operador.**
   - Posible en teoría con `admin.signOut(jwt, "global")`, pero necesita un token de ese usuario.
   - Alternativa: una función `SECURITY DEFINER` que borre sus filas en `auth.sessions` y `refresh_tokens`. Hay que confirmar que tenga permiso.
   - Ninguna de las dos toca cuentas empresariales si se filtra por el `user_id` del operador. Los tokens ya emitidos siguen vivos hasta expirar, salvo que se combine con el punto 1.

## Siguiente paso sugerido (en Git)
Probar los puntos 1 y 4 en un entorno de prueba, nunca en producción, y confirmar la lista de redirects antes de usar redirects en invitaciones.
