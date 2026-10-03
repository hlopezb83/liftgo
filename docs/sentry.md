# Monitoreo sencillo de LiftGo con Sentry

## Alcance

LiftGo usa Sentry para registrar errores del navegador y del servidor
TanStack Start/Nitro. El SDK de ambas capas permanece en 11.4.0. Se conserva
el piloto Deno compatible de `parse-csf`, con SDK 10.76.0.

El perfil no instala la integración de rendimiento del router, no envía trazas
y no activa Replay. La variable antigua `VITE_SENTRY_REPLAY` no tiene efecto.
Se retiraron el módulo opcional de Replay y su dependencia directa; el SDK puede
mantener paquetes de Replay como dependencias transitivas, sin activarlos.

Las demás Edge Functions y tareas programadas se investigan con los logs
nativos de Lovable Cloud. Su instrumentación en Sentry es opcional y debe
responder a una necesidad concreta; no es un requisito para cerrar este alcance.
Un fallo interno de un cron sin navegador puede aparecer sólo en esos logs.

## Captura y contexto

- `src/client.ts` importa `instrument-client.ts` antes de hidratar el ERP.
  `package.sideEffects` conserva el módulo de inicialización.
- El cliente se inicializa una sola vez en producción. Pruebas y desarrollo
  permanecen apagados; `VITE_SENTRY_FORCE=1` permite una prueba local deliberada.
  Un `VITE_SENTRY_DSN` explícitamente vacío lo desactiva.
- `release` usa `liftgo@<public/version.json>`. Ruta, flujo y espacio de trabajo
  se sincronizan en la raíz común de ERP, Plataforma y portal, sin tracing.
- `notifyError` registra incidentes técnicos mediante el capturador central.
  Validaciones, conflictos de negocio y warnings conservan su diagnóstico local.
  Los toasts mantienen error original, JSON copiable y detalles si falla Sentry.
- No se manda a Sentry el reporte JSON completo, formulario ni respuesta cruda.
  Los filtros conocidos de ResizeObserver no ocultan fallos de chunks.

## Privacidad y separación empresarial

`dataCollection` desactiva datos automáticos de usuario, cookies, cabeceras,
cuerpos, filtros de URL, consultas, variables y entradas/salidas AI.
En SDK 11 no se usa la opción antigua `sendDefaultPii`.

Sólo se agrega ID de actor, empresa verificada, rol y espacio de trabajo.
No agregar nombre empresarial, RFC, correo ni claves fiscales. Cambiar de usuario
o empresa limpia breadcrumbs/contexto; cerrar sesión retira la identidad.
Las revisiones evitan que una limpieza tardía del espacio anterior borre la
identidad nueva. Plataforma no hereda una empresa del ERP.

`beforeSend` sanea errores; console y breadcrumbs de interacción se omiten.
Logs y métricas se descartan. El filtro de spans se conserva como defensa
si otro consumidor los genera, aunque el perfil de producción no los envía.

## Servidor

`@sentry/cloudflare` usa la API pública `wrapRequestHandler` y
AsyncLocalStorage. Nitro administra el worker; no agregar otro plugin
de Cloudflare, instrucciones Node `--import` ni un segundo servidor.

Cada solicitud tiene un scope independiente. Los guards agregan identidad sólo
después de verificarla, sin consultas adicionales ni confiar en headers/input.
Se capturan SSR y server functions sin cambiar sus respuestas, repetir mutaciones
ni sustituir errores originales. Rechazos esperados 4xx quedan fuera.

El servidor acepta `SENTRY_DSN` del runtime y conserva el fallback público
del cliente; un DSN vacío lo desactiva. Usa `waitUntil` cuando existe y un
presupuesto acotado de 750 ms en el runtime fetch-only. La entrega es de mejor
esfuerzo; un fallo del transporte no debe bloquear la operación.

## Piloto de Cloud

El runtime inspeccionado declara Deno 2.1.4; SDK 11 requiere Deno >=2.8.3.
`parse-csf` usa `npm:@sentry/deno@10.76.0` y lock formato 4.
La entrada desplegada registró `liftgo.edge.sentry` con `active:true`.
OPTIONS sin PDF ni credenciales aprobó HTTP/CORS; esto no demuestra recepción
de un evento en la cuenta de Sentry.

El piloto conserva permisos, rate limit, PDF, prompt, modelo y respuestas.
Actor/rol se adjuntan después de Auth. No hay empresa verificada en ese flujo
y nunca se deriva una del PDF o payload.

El wrapper aísla Requests/jobs, descarta datos fiscales, documentos, prompt,
mensajes del proveedor y extras. Capturas y cleanup fallidos no repiten trabajo.
El envío alternativo tiene un presupuesto de 500 ms. Un rechazo esperado 4xx
no genera incidente; un 500 explícito prevalece sobre un 4xx adjunto.

No instalar SDK Deno 11 hasta verificar el runtime desplegado compatible.
Si falla la importación, restaurar la entrada anterior y desplegarla.
`SENTRY_ENABLED=0` desactiva capturas tras importar, pero no corrige una
importación incompatible. No se requieren migraciones de datos.

## Cuenta y alerta

La revisión autorizada del 3 de octubre de 2026 confirmó:
- Recepción de LIFTGO-3, mecanismo `liftgo.server`, SDK 11.4.0 y
  release `liftgo@8.43.11`, correspondiente al fallo de acceso anterior.
- Alerta existente activa para prioridad alta y un disparo registrado.
  Esto acredita la regla, no entrega efectiva del correo al destinatario.
- Un error aceptado en 14 días, sin límites de cuota ni eventos inválidos.
- Ningún mapa de código subido en la vista Source Map Uploads.

Conservar una alerta sencilla. Si se necesita avisar de toda incidencia nueva
o regresión de producción, revisar el filtro de prioridad antes de crear
otra regla; no duplicar alertas para cada empresa.

## Mapas de código: opcionales

El DSN permite capturar errores sin token de administración.
`SENTRY_AUTH_TOKEN` se usa únicamente durante el build para subir mapas.

Los project secrets de Cloud son de runtime y no participan en el build.
Lovable documenta Build secrets sólo para Enterprise: los configura manualmente
el administrador del workspace y se comparten entre todos sus proyectos.

`vite.config.ts` genera mapas ocultos y activa el plugin sólo si hay token
de build. Si se habilita, verificar también la salida final Nitro y el orden
de subida/borrado; CI verde por sí solo no demuestra mapas correctos.
Un build independiente de GitHub no garantiza correspondencia con el publicado.
Nunca poner el token privado en una variable `VITE_*` ni en Git.

Con el hosting actual se aceptan stacks compilados en el alcance básico.
No cambiar de plan sólo por esta mejora. Cuando exista un flujo de build
compatible, verificar un evento nuevo del release publicado con código fuente
resuelto y que los mapas no se sirvan públicamente.

## Verificación

Las pruebas usan SDK real con transporte en memoria: incidentes saneados,
deduplicación, cambios A/B, logout, ausencia de spans/Replay y resiliencia.
SSR cubre concurrencia, plataforma, identidad anónima, streaming y transporte
fallido o detenido. Deno prueba compatibilidad con CLI 2.1 y aislamiento.

El smoke de producción usa DSN de loopback, bloquea red externa y comprueba
SDK activo, Replay apagado, hidratación e interacción del ERP/portal.
Para acreditar recepción real, usar un error controlado inocuo; no usar
timbrados, pagos ni documentos como sondas. No afirmar cobertura total de Cloud.

## Fuentes oficiales

- [Opciones del SDK React](https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/)
- [Mapas con Vite](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/)
- [Migración SDK 11 y mínimos de runtime](https://github.com/getsentry/sentry-javascript/blob/11.4.0/MIGRATION.md)
- [Wrapper Cloudflare](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/cloudflare/src/request.ts)
- [Lovable: Secrets](https://docs.lovable.dev/features/secrets)
- [Lovable: Build secrets](https://docs.lovable.dev/features/build-secrets)
- [Lovable: Logs](https://docs.lovable.dev/features/logs)
