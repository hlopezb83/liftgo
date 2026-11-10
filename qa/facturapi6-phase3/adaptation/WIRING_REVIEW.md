# Conexión offline parcial — NO-GO

10/11/2026. Sin endpoint, despliegue, base, secretos o proveedor.

## Preparado

NC/REP/cancelar/refresh reciben fábrica opcional `createQaClient`; sólo se cambia firma y construcción del cliente. Gateway de factura permite la misma inyección. `offlineSdkFactory` conecta una vista local de `prepareOfficialCalls` a un cliente ya suministrado; no crea SDK ni resuelve llaves. Por defecto sigue `QA_TRANSPORT_BLOCKED`.

El request delegado combina señal de run y timeout por llamada con `AbortSignal.any`, sin ignorar señales desconocidas: esas se rechazan. Factura y descarga siguen byte a byte; los otros cuatro handlers preservan lógica salvo inyección, comprobada por procedencia normalizada. No se cambió SDK ni código operativo.

## Evidencia y límites

7 pruebas de wiring: refresh auténtico con sesión/admin/pertenencia **ficticios**, resolver QA y SDK 6/request ficticio. Comparación gated vs sin gate con iguales dobles: respuesta, consultas, filtros, escritura pending y opciones SDK iguales salvo señal. No compara resolver heredado ni paridad integral v5/v6. Casos: estado terminal, persistencia fallida, expiración durante SDK sin retrieve/UPDATE, tenant ajeno y scope ausente. Gateway auténtico create/PDF/XML prueba delegación al request con señales y bytes ficticios.

38 pruebas TypeScript focales y 3 de procedencia; CI completo pendiente. No acredita servicios reales, autorización alojada, SQL/triggers, abort efectivo del socket/cuerpo, bundle workerd ni runtime Deno integral.

## Continuación 8.52.7 — evidencia focal adicional

Gateway conecta `consumeForClient` en PDF/XML auténticos: cuerpos ficticios diferidos que vencen no retornan archivos. `guardOfflineEffects` se conecta al admin ficticio del refresco y de descarga NC; `guardOfflineFetch` al fetch existente de esa descarga, sólo dentro de tests. NC confirma bytes/filtros/proyección tenant y persistencia abierta; vencimiento al consumir da 502, sin upload/UPDATE; durante upload da 500, sin UPDATE. Conserva traducciones históricas y no promete revertir efectos enviados. El retry histórico puede esperar nuevamente tras un error TTL, pero el gate bloquea nuevas peticiones; no se afirma cero esperas.

Resultado local: 50/50 pruebas TypeScript en cuatro archivos afectados y 4/4 de procedencia Python. ESLint focal sin errores; validación completa queda en CI. No equivale a flujo fiscal alojado ni Deno integral.

Revisión independiente confirma alcance parcial: clientes originales fuera del proxy no quedan protegidos, resultados Blob/stream de Storage no se envuelven, thenables reales y persistencia universal no están acreditados. Response.body/clone quedan bloqueados fail-closed y Request.signal se conserva. No hay conexión a endpoint ni runtime operativo.

## Hallazgos anteriores y pendientes que mantienen el bloqueo

- Señales de otro realm no deben sustituirse silenciosamente: ahora fail-closed y regresión focal. La combinación a través del wrapper auténtico se prueba en gateway; no hay evidencia de todos los runtimes.
- Gateway PDF/XML ahora valida consumo antes/después; falta conectar y acreditar persistencia en todos sus consumidores. No declarar downloads integralmente protegidos.
- `download-cfdi/handler.ts:242–270` usa fetch directo inyectado y Storage; no se convirtió a SDK alternativo ni está conectado a este helper. Falta adaptación explícita de fetch/consumo y pruebas auténticas.
- Sólo refresh pending se compara lado a lado; inyección no demuestra paridad de factura/REP/NC/cancelación/descarga, folios, saldo, claims, fechas, idempotencia y fallas parciales. Las pruebas de procedencia verifican que las cuatro fábricas se generaron y que no cambiaron otras instrucciones.
- Admin ficticio de refresh usa ahora el helper de efectos, no un checkpoint exclusivo del doble; **no es un guard desplegado** ni protección universal de consultas. Falta gate tras cada await y antes de cada operación ERP/Storage real en restantes handlers.
- Error tras escritura enviada significa incierto; falta diario durable conectado y cierre sin retry, saneamiento de logs, TOCTOU configuración y contención/pausa de crons. No liberar reservas para repetir ni prometer abort/rollback de efectos enviados.

No conectar ejecutor/UI ni abrir ventana hasta resolver estos hallazgos y revisión independiente. Preflight conserva run/fechas cerrados, `enabled=false`, `shutdown=true`. Sin SQL/migraciones/permisos/datos/publicación.

## Continuación 8.52.8 — cierres puntuales, NO-GO permanece

Cache hit NC auténtico ya está cubierto: materialización explícita Blob→bytes con gate antes/después, cliente guardado con scope, y tests de cierre durante download/consumo sin consultas a secreto/proveedor ni escrituras. Rama abierta conserva bytes/headers. Generador, normalización, procedencia y diff documentan esta adaptación semántica; las afirmaciones anteriores de descarga byte a byte aplicaban al estado previo.

Se elimina exclusivamente el cuerpo del proveedor del log de `facturapiErrorResponse`; test 400 ficticio conserva respuesta 502 y status saneado. Revisión independiente identificó el hueco de Storage y esta fuga. Persisten logs de errores arbitrarios en otros lugares, ramas REP/factura/acuse sin acreditar, UPDATE sólo por id tras upload (TOCTOU y cero filas no acreditados), paridad de emisiones/cancelación, diario durable, pausa/cierre y autorización de ventana. No generalizar estas pruebas a efectos reales o runtime Deno.

Resultado focal: 55 Bun + 4 Python; preflight actual 85 Vitest, fuente apagada intacta. ESLint limpio; CI completo pendiente.