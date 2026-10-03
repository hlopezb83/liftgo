# Monitoreo de LiftGo con Sentry

## Diagnóstico local cuando falla el SDK

`captureOperationalError` contiene los fallos al consultar el cliente, crear el
scope o capturar el incidente. Los toasts conservan el error original, su JSON
copiable y la acción de detalles, incluidos los toasts asíncronos. Un intento
fallido de captura puede reintentarse; la deduplicación se aplica tras capturar.
Las pruebas ejercitan la copia real al portapapeles con el SDK simulado fallando.

## Resiliencia desde 8.43.11

- La inicialización del navegador y la conexión con TanStack Router contienen
  los fallos del diagnóstico; el ERP puede continuar. Sólo una instalación
  correcta marca la integración como conectada.
- En SSR, el contexto asíncrono se configura dentro de la misma protección del
  wrapper. Adjuntar identidad y capturar errores nunca cambia el resultado de
  los permisos ni reemplaza el error original del negocio.
- La clasificación lee propiedades de datos propias de `status`, `statusCode`
  y `message`; no ejecuta accesores. Se mantienen los rechazos esperados y
  los fallos de disponibilidad, la privacidad y los scopes por solicitud.
- Las pruebas incluyen fallo de inicialización, reintento del router, fallo de
  identidad con el SDK real y error con un accesor de estado que lanza.

## Alcance desde 8.43.8

- SDK de navegador: `@sentry/react` 11.4.0. Plugin de compilación:
  `@sentry/bundler-plugins/vite` 11.4.0. Dependencias fijadas en Bun.
- `src/client.ts` importa primero `instrument-client.ts`, que llama
  explícitamente a `initClientSentry`, y luego hidrata la aplicación.
  `package.sideEffects` conserva ese módulo y la configuración global de Zod;
  el resto del proyecto permite tree shaking.
- La configuración no inicializa el SDK en SSR, pruebas o desarrollo.
  `VITE_SENTRY_FORCE=1` permite una prueba local deliberada;
  `VITE_SENTRY_DSN=` vacío desactiva el cliente.
- El router real agrega una sola integración de TanStack Router. La sincronización
  de navegación vive en la raíz común de ERP, plataforma y portal.
- `release` usa `liftgo@<public/version.json>` tanto en el navegador como en
  el plugin. No usar un override independiente de release.

## Datos, separación empresarial y volumen

- `dataCollection` desactiva datos de usuario automáticos, cookies, cabeceras,
  cuerpos, filtros de URL, datos de consultas, variables y entradas/salidas AI.
  En Sentry 11 `sendDefaultPii` dejó de ser una opción válida.
- Sólo se agrega el ID del actor, ID de empresa verificada, rol y espacio de
  trabajo. Nunca agregar nombre empresarial, RFC, email ni claves de Facturapi.
- El cambio de sesión/empresa limpia breadcrumbs y contexto previo. Los tags
  de errores y atributos de spans se retiran cuando la identidad deja de existir.
  Cada sincronización obtiene una revisión: un desmontaje tardío del espacio
  anterior no puede borrar la identidad nueva. La purga de caché sólo retira
  el diagnóstico del usuario anterior, conservando el ya verificado del nuevo.
- `beforeSend` sanea errores; `beforeSendSpan` sanea spans en stream mode.
  Los filtros de errores no se aplican automáticamente a spans o Replay.
  Se eliminan query/hash y parámetros de ruta de los spans. Se preserva el
  origen de los scripts para resolver mapas de código.
- `notifyError` registra incidentes técnicos. No envía el reporte JSON completo,
  variables de mutación o respuestas crudas. Validaciones, conflictos de negocio
  y avisos conservan su diagnóstico local sin convertirse en incidentes.
- Trazas de producción: 10%. Logs y métricas están descartados en sus callbacks.
  Se evita propagar cabeceras de trazado a servicios externos.
- Los fallos de descarga de chunks siguen visibles. Sólo se excluye el ruido
  conocido de ResizeObserver.

## Replay: desactivado por defecto

`replaysSessionSampleRate` y `replaysOnErrorSampleRate` valen cero por defecto.
No se descarga el módulo de Replay. El opt-in `VITE_SENTRY_REPLAY=1` sólo debe
configurarse después de verificar grabaciones reales saneadas y su cuota.

El SDK 11.4 llama `beforeAddRecordingEvent` únicamente para eventos personalizados;
la URL del evento DOM Meta no pasa por ese callback. El enmascaramiento de texto
e inputs no demuestra que los enlaces de recuperación, filtros o fragmentos de
URL estén saneados. Este punto necesita una validación aparte antes de activar.

El módulo opcional usa importación dinámica, máscara de texto/inputs/atributos,
bloqueo de medios, cuerpos de red desactivados, sesiones sin persistencia y
filtros propios. El cambio de identidad descarta el buffer pendiente.
No afirmar que estas medidas cubren todos los eventos del DOM.

## Mapas de código en el hosting

Con `SENTRY_AUTH_TOKEN` presente, el build genera mapas ocultos y el plugin
los sube y elimina los archivos `.map` después de subirlos.
`SENTRY_ORG` y `SENTRY_PROJECT` seleccionan el destino;
`SENTRY_RELEASE_COMMIT` permite asociar el commit del repositorio.
El token es privado y nunca debe tener prefijo `VITE_`.

El CI de PR no necesita ese token ni datos de producción. Por lo tanto un build
aprobado en CI no demuestra una subida de mapas en Lovable Cloud. El responsable
de Sentry debe comprobar un evento del release correcto con stack resuelto y
que los mapas no se sirvan públicamente.

## Servidor desde 8.43.10

- `@sentry/cloudflare` 11.4.0 instrumenta la entrada SSR de TanStack Start
  con la API pública `wrapRequestHandler` y AsyncLocalStorage oficial. Nitro
  ya administra el worker: no agregar un segundo plugin de Cloudflare/Vite.
- El SDK comparte el cliente entre solicitudes; cada invocación tiene su scope
  independiente. La recuperación de errores originales de h3 también usa
  AsyncLocalStorage, en lugar de un último error global.
- El servidor toma `SENTRY_DSN` de bindings del worker/Nitro o del entorno;
  conserva el fallback público del navegador. Un DSN explícitamente vacío lo
  desactiva. En desarrollo y pruebas permanece apagado salvo opt-in deliberado.
- `waitUntil` se obtiene del contexto del worker, de `request.runtime.cloudflare`
  o del Request aumentado por Nitro. El runtime fetch-only envía los fallos ya
  capturados antes de devolver un stream, con presupuesto total de 750 ms.
  Es un envío de mejor esfuerzo: un transporte detenido no puede bloquear el ERP.
- Los errores SSR, incluyendo el 500 genérico de h3, y las excepciones de las
  server functions se capturan sin cambiar sus respuestas ni repetir operaciones.
  Autenticación y CSRF conservan su orden y sus controles. Los rechazos 4xx y
  errores esperados de autenticación quedan fuera; los 5xx siguen visibles.
- Los guards existentes agregan actor, rol y empresa sólo después de verificarlos.
  Plataforma retira la empresa del scope. No se confía en headers, IDs del input
  ni tokens decodificados sin verificar. No se agregan consultas de autorización.
- Se excluyen cuerpos, cabeceras, cookies, filtros de URL y extras arbitrarios,
  incluyendo la serialización automática de objetos lanzados. Console no se
  captura como breadcrumbs. Logs, métricas y trazas del servidor están apagados.
- El smoke usa un DSN de loopback para el servidor y bloquea la red externa en
  el navegador. Un error del build de prueba nunca debe llegar a la cuenta real.
- Las Edge Functions Deno de Lovable Cloud, tareas programadas y webhooks aún
  requieren instrumentación propia. Este cambio cubre el servidor TanStack/Nitro.

## Verificación y pendientes

Antes de instalar el SDK Deno 11, confirmar Deno >=2.8.3 en el proceso desplegado,
no en el sandbox de herramientas. `parse-csf` registra al arrancar una línea
`liftgo.edge.runtime` con Deno/V8/TypeScript y una prueba concurrente de
AsyncLocalStorage. No lee solicitudes, variables de entorno ni documentos, ni
envía telemetría a Sentry. La ausencia/falla de la prueba no altera el handler.
`sentry11RuntimeMinimumMet` acredita sólo el mínimo de versión y aislamiento;
todavía hay que probar y desplegar el SDK completo. La comprobación queda en
los logs de Cloud, sin un endpoint de diagnóstico público.

- Tests de privacidad incluyen credenciales sintéticas, console, ciclos/getters,
  fragmentos OAuth, spans, Replay y conservación de rutas de scripts.
- El transporte en memoria usa el SDK real y valida el envelope saneado,
  deduplicación de incidentes y cambio de empresa/logout, sin red.
- El smoke del bundle de producción verifica SDK 11.4 activo y Replay apagado,
  junto con hidratación e interacción del ERP y portal; bloquea toda red externa.
- Queda pendiente comprobar recepción en la cuenta Sentry, cuota, retención,
  alertas y subida de mapas del hosting.
- Las pruebas del SDK real cubren solicitudes concurrentes A/B, la siguiente
  solicitud anónima, privacidad, deduplicación, plataforma, los tres caminos de
  `waitUntil`, streaming y transporte fallido o detenido, sin red.
- Quedan pendientes las Edge Functions Deno y la recepción/mapas/alertas en
  la cuenta Sentry. No instalar instrucciones de Node `--import` sobre el worker.

## Fuentes oficiales

- [Release 11.4.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.4.0)
- [Migración 10 a 11](https://docs.sentry.io/platforms/javascript/migration/v10-to-v11/)
- [TanStack Router](https://docs.sentry.io/platforms/javascript/guides/react/features/tanstack-router/)
- [Privacidad de Replay](https://docs.sentry.io/platforms/javascript/session-replay/privacy/)
- [Código del SDK](https://github.com/getsentry/sentry-javascript/tree/11.4.0/packages)
- [Cloudflare Workers](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
- [Wrapper público de solicitudes](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/cloudflare/src/request.ts)
