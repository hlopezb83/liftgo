# Monitoreo de LiftGo con Sentry

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

## Verificación y pendientes

- Tests de privacidad incluyen credenciales sintéticas, console, ciclos/getters,
  fragmentos OAuth, spans, Replay y conservación de rutas de scripts.
- El transporte en memoria usa el SDK real y valida el envelope saneado,
  deduplicación de incidentes y cambio de empresa/logout, sin red.
- El smoke del bundle de producción verifica SDK 11.4 activo y Replay apagado,
  junto con hidratación e interacción del ERP y portal; bloquea toda red externa.
- Queda pendiente comprobar recepción en la cuenta Sentry, cuota, retención,
  alertas y subida de mapas del hosting.
- SSR Cloudflare y funciones de Lovable Cloud todavía no tienen instrumentación
  Sentry propia. No instalar instrucciones de Node `--import` sobre el worker;
  su integración requiere un cambio y pruebas específicas por runtime.

## Fuentes oficiales

- [Release 11.4.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.4.0)
- [Migración 10 a 11](https://docs.sentry.io/platforms/javascript/migration/v10-to-v11/)
- [TanStack Router](https://docs.sentry.io/platforms/javascript/guides/react/features/tanstack-router/)
- [Privacidad de Replay](https://docs.sentry.io/platforms/javascript/session-replay/privacy/)
- [Código del SDK](https://github.com/getsentry/sentry-javascript/tree/11.4.0/packages)
