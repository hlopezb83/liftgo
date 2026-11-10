# Revisión independiente: pantalla temporal de sólo lectura

Base inspeccionada: `6cc1d438966d66b4e3195c380abaad5b2b0ceec4`.
Ruta Preview: `/qa/facturapi6-preflight`. Sin menú operativo, loader, envío al montar ni consulta automática. El contenido público es solamente el estado deshabilitado; el RPC es la frontera de seguridad. No es una ruta de datos públicos.

## Estado de entrega

`enabled:false`, `shutdown:true`, fechas cero. No se ejecutó preflight, no se crearon sesiones, no se leyeron secretos, no hubo llamadas fiscales, despliegue, publicación ni escrituras de BD. No se agregaron Edge Functions. Se mantiene `src/start.ts` y el `authAttacher` original: usa solamente la sesión existente del iframe. No se usa invocador externo ni token alternativo.

## Activación futura (todavía NO autorizada para ejecución)

Tras revisión independiente, preparar un cambio explícito en `src/lib/qa/facturapi6-preview/policy.ts`: runId nuevo no secreto, startsAt/expiresAt fijos en UTC, duración de hasta 7 200 000 ms; enabled true y shutdown false. Revisar el nuevo manifiesto antes de probar. No usar variables secretas, query params o configuración de navegador para renovar la ventana. Una ventana que expire queda cerrada; no extender el mismo run. Abrir la ruta en Preview con la sesión humana real y pulsar una sola vez. La pantalla no intenta iniciar sesión ni emitir tokens. No publicar frontend.

Apagado: mantener shutdown true o enabled false en fuente y verificar el cambio en Preview; vencimiento bloquea toda operación aunque se deje abierta una pestaña. Un cambio de fuente no garantiza revocar un request ya en vuelo: el GET tiene señal y timeout menor de 15 s (14 900 ms) o tiempo restante; la expiración se revisa antes de GET y después de respuesta. No hay retry.

## Controles y acceso mínimo

Origen exacto autorizado y compilación DEV (fail-closed en producción). Claims verificados por backend, role authenticated, sub UUID, session_id UUID y getUser del mismo token con usuario coincidente. Perfil presente, único y activo; has_role(admin) con cliente del usuario bajo RLS, membresía única interna de tenant fijo, organización activa. Rechaza cron/service_role y cualquier ambigüedad. Tenant fijo: ELOGISTIX SHIPPING / Empresa Prueba.

Cliente autenticado lee perfiles, rol, membresía, organización y company_settings; modo explícito test antes de cargar cliente privilegiado. Luego el cliente servidor ya existente lee sólo facturapi_test_key del tenant y hace una comprobación de existencia de otro dueño de la misma llave; no lista otras empresas. Nunca lee columna live ni usa env fallback. No devuelve llave, hash, longitud, RFC, IDs, nombre recibido ni errores crudos. No registra errores de proveedor/BD. Acceso real/RLS no se probó: ante bloqueo se detiene, no se amplían permisos.

Sólo organizations.me() del SDK exacto con GET oficial. Transporte aislado restringe ruta/método, propaga AbortSignal, prohíbe redirecciones. Compara razón social y RFC del emisor con configuración fija autorizada; sólo devuelve estado y booleanos. No certifica selección fiscal, catálogo SAT ni documentos.

## Adaptación runtime / identidad

`facturapi6-preview: npm:facturapi@6.0.0` es un alias nuevo exclusivo del servidor de QA. No se cambian imports ni config/lock del SDK operacional Deno. SDK npm sin dependencias; usa fetch. Se conserva snapshot y runner Deno byte a byte. Se reutilizan por importación checkTestKey y compareIssuer del núcleo portable revisado; identidad y lectura de configuración se adaptan a clientes TanStack bajo RLS antes de cargar lector privilegiado. Se reemplaza Deno.serve/env por createServerFn y env dentro del handler; transporte organizations.me replica la técnica aislada del preflight Deno.

La versión instalada usa `.validator`, no `.inputValidator`; se sigue API de este checkout. Local corre Vite/Node; hospedado usa Worker, no Deno. Tests del SDK con fetch doble demuestran contrato local, NO prueba integral del candidato Deno ni compatibilidad runtime publicada. Sin operaciones invoices, handlers fiscales o persistencia ERP.

## Claims y concurrencia

Esta lectura no reclama ni escribe datos técnicos. Por eso no requiere migración. Un intento por montaje en la interfaz no equivale a exclusión global: pestañas o llamadas RPC concurrentes pueden hacer varios GET autorizados. No se promete ejecución global exactamente una vez ni shutdown durable irreversible contra un nuevo cambio de fuente. Si revisión exige claim atómico durable o cierre persistente irreversible, hará falta un mecanismo técnico de escritura ya autorizado y verificado; no existe en este candidato y NO se ejecutó. No se improvisa migración.

## Validación y límites

Pruebas focales Vitest con dobles: estado apagado, TTL, origen, claims/sesión, usuario, perfil/rol/membresía/organización, modo test antes de secretos, respuesta saneada, vencimiento, GET SDK6/señal/pre-abort y UI sin envío. ESLint focal. El verificador automático del proyecto comprueba tipos/build; no se ejecuta suite global ni build manual. CI completo, runtime hospedado, acceso real y preflight con sesión real quedan pendientes de revisión. Nunca validar con SDK5 ni ejecutar fiscal.

`MANIFEST.json`: SHA256 de fuentes QA y dependencias revisadas. Metadata public/version.json y changelog-recent pueden regenerarse automáticamente; no se editan manualmente.
