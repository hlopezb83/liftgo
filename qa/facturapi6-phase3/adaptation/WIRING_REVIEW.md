# Conexión offline parcial — NO-GO

10/11/2026. Sin endpoint, despliegue, base, secretos o proveedor.

## Preparado

NC/REP/cancelar/refresh reciben fábrica opcional `createQaClient`; sólo se cambia firma y construcción del cliente. Gateway de factura permite la misma inyección. `offlineSdkFactory` conecta una vista local de `prepareOfficialCalls` a un cliente ya suministrado; no crea SDK ni resuelve llaves. Por defecto sigue `QA_TRANSPORT_BLOCKED`.

El request delegado combina señal de run y timeout por llamada con `AbortSignal.any`, sin ignorar señales desconocidas: esas se rechazan. Factura y descarga siguen byte a byte; los otros cuatro handlers preservan lógica salvo inyección, comprobada por procedencia normalizada. No se cambió SDK ni código operativo.

## Evidencia y límites

7 pruebas de wiring: refresh auténtico con sesión/admin/pertenencia **ficticios**, resolver QA y SDK 6/request ficticio. Comparación gated vs sin gate con iguales dobles: respuesta, consultas, filtros, escritura pending y opciones SDK iguales salvo señal. No compara resolver heredado ni paridad integral v5/v6. Casos: estado terminal, persistencia fallida, expiración durante SDK sin retrieve/UPDATE, tenant ajeno y scope ausente. Gateway auténtico create/PDF/XML prueba delegación al request con señales y bytes ficticios.

38 pruebas TypeScript focales y 3 de procedencia; CI completo pendiente. No acredita servicios reales, autorización alojada, SQL/triggers, abort efectivo del socket/cuerpo, bundle workerd ni runtime Deno integral.

## Hallazgos de revisión independiente que mantienen el bloqueo

- Señales de otro realm no deben sustituirse silenciosamente: ahora fail-closed y regresión focal. La combinación a través del wrapper auténtico se prueba en gateway; no hay evidencia de todos los runtimes.
- Gateway PDF/XML sí pasa por `invoices.client.request` de la vista inyectada, pero **decodificar después no pasa por `consume`**. Falta gate tras consumo y antes de persistencia. No declarar downloads integralmente protegidos.
- `download-cfdi/handler.ts:242–270` usa fetch directo inyectado y Storage; no se convirtió a SDK alternativo ni está conectado a este helper. Falta adaptación explícita de fetch/consumo y pruebas auténticas.
- Sólo refresh pending se compara lado a lado; inyección no demuestra paridad de factura/REP/NC/cancelación/descarga, folios, saldo, claims, fechas, idempotencia y fallas parciales. Las pruebas de procedencia verifican que las cuatro fábricas se generaron y que no cambiaron otras instrucciones.
- Mock DB de refresh verifica ventana antes de UPDATE; **no es un guard desplegado** ni protección universal de consultas. Falta gate tras cada await y antes de cada operación ERP/Storage real.
- Error tras escritura enviada significa incierto; falta diario durable conectado y cierre sin retry, saneamiento de logs, TOCTOU configuración y contención/pausa de crons. No liberar reservas para repetir ni prometer abort/rollback de efectos enviados.

No conectar ejecutor/UI ni abrir ventana hasta resolver estos hallazgos y revisión independiente. Preflight conserva run/fechas cerrados, `enabled=false`, `shutdown=true`. Sin SQL/migraciones/permisos/datos/publicación.