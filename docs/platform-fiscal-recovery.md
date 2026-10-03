# Conciliación fiscal de Plataforma

Raíz y Soporte pueden consultar un trabajo concreto con `integrations.retry`,
sesión vigente, revisión del historial y un motivo de 10 a 300 caracteres.
Observador conserva la lectura. El administrador empresarial no recibe acceso
global. La acción guarda operador, motivo y resultado; el navegador nunca recibe
la llave de Facturapi, la huella, el snapshot del documento ni el payload fiscal.

## Consulta y reprogramación

El servidor reserva el trabajo durante dos minutos y realiza un solo GET de
Facturapi, con límite de ocho segundos y 256 KiB. Usa el ID ya conocido o busca
el `external_id` exacto del documento. Comprueba empresa fiscal mediante la
configuración histórica, ambiente, identidad, UUID y folio del proveedor.
Un listado incompleto, duplicado, un 404 por ID, 202 HTTP, error o timeout es
incierto; no habilita otro timbrado. No hay POST ni cancelación desde esta consulta.

- Un ID pendiente se conserva sin UUID y pasa al conciliador existente.
- Un CFDI válido conserva UUID, folio y serie de Facturapi; permanece en
  `stamping` hasta recuperar sus archivos. No se inventa un timbrado terminado.
  El número usa al menos cuatro dígitos (`FAC-0042`) y conserva los folios mayores
  completos (`FAC-12345`); nunca genera un folio fiscal propio ni lo recorta.
- Un CFDI encontrado ya cancelado conserva también ID, UUID y folio. Un XML
  faltante queda señalado; el flujo existente de descarga puede recuperarlo.
- Reprogramar exige ausencia observada para una emisión sin ID/UUID, o una
  cancelación confirmada como disponible. Una cancelación pendiente no se reenvía.
  Un resultado incierto o fallido pausa los reintentos automáticos del trabajo.
  Una cancelación pendiente confirmada con ID/UUID se conserva también en el
  documento, para impedir que el ERP vuelva a solicitarla.
- Conserva payload, intentos, folio y diagnóstico anterior. Agrega como máximo
  un intento disponible, con límite de cinco reprogramaciones y veinte intentos.
- Repetir el mismo ID de solicitud no repite el GET. Ante respuesta de transporte
  incierta, la interfaz ofrece comprobar esa misma solicitud.

La terminación vuelve a comprobar sesión, permisos, configuración y snapshot.
La revisión y el token de cola deben pertenecer a la reserva: un nuevo dueño
puede conservar `processing` sin cambiar la revisión del historial. La cola y
el documento se actualizan en una sola transacción SQL. Un fallo, incluso por
folio duplicado, revierte toda la recuperación. Una reserva vencida sólo libera
el trabajo si conserva su token; nunca libera el trabajo de otro proceso.

## Configuración usada en el intento

El enqueue conserva SHA-256 de `ambiente:llave` usada realmente por el handler,
sin guardar la llave en el payload. El historial distingue este contexto de la
configuración meramente observada en trabajos anteriores. Estos últimos siguen
visibles y no se reprograman sin evidencia de la configuración original.

El consumidor y las funciones internas verifican empresa, documento, operación,
token y huella. La función de timbrado vuelve a verificar después del lookup del
consumidor: una llave rotada durante ese GET no se usa para emitir en otra empresa
fiscal. Un cambio detiene el trabajo sin consumir un intento; un fallo de lectura
lo difiere. Las llamadas normales del ERP conservan sus permisos y validaciones.

## Despliegue y verificación

1. Aprobar CI, SQL/RLS y A/B del SHA exacto. Las pruebas SQL usan PostgreSQL
   efímero y `ROLLBACK`; las pruebas del SDK usan transporte en memoria.
2. Confirmar en Cloud el ledger, la versión publicada y los estados de cola.
   Aplicar 0099 antes de activar las funciones que consultan `config_source`.
   Si el servidor publicado es anterior a 8.43.12, diferir `integrations.retry`
   en `platform_profile_capabilities` dentro de la misma transacción: conservar
   todas las otras capacidades e incrementar la revisión de Raíz/Soporte.
   Registrar esta definición temporal; no reescribir el SQL ni el hash del ledger.
   La validación antigua rechaza un permiso desconocido y bloquea el portal.
3. Desplegar `stamp-cfdi`, las tres cancelaciones y
   `refresh-cancellation-status`; después `process-cfdi-retry-queue`.
4. Publicar la interfaz y verificar lectura/permisos, motivos, resultado
   pendiente y copia JSON. No ejecutar el cron de emisión como prueba de arranque.
5. Tras verificar funciones y publicación compatible, restaurar la definición
   exacta de `platform_profile_capabilities` de 0099 e incrementar la revisión
   de Raíz/Soporte en una transacción. Comprobar el permiso y la interfaz con
   sesión vigente. Hasta entonces las acciones manuales nuevas permanecen apagadas.

El lector de la respuesta propia de `get_platform_access` conserva sólo las
capacidades reconocidas por esa versión, para tolerar futuras ampliaciones de la
BD. No convierte permisos desconocidos en existentes. Perfil, revisión, estado
operador y formato siguen validados; una respuesta no operadora con permisos o
un error del RPC falla. El contrato público de acceso permanece estricto, y los
guards/RPCs vuelven a verificar cada capacidad vigente en la BD.

La protección histórica de este bloque cubre trabajos de `cfdi_retry_queue`.
No acredita la llave histórica de todos los documentos antiguos ni sustituye
la auditoría del conciliador general de timbrados interrumpidos. Una descarga
pendiente requiere su flujo de recuperación; SQL no obtiene XML/PDF del PAC.
La instrumentación Deno de Sentry y la recepción en su cuenta tienen validación
separada. Este documento no acredita una migración o publicación por sí solo.

Fuentes oficiales: [API de Facturapi](https://docs.facturapi.io/en/api/),
[paginación](https://docs.facturapi.io/en/docs/guides/pagination/).
