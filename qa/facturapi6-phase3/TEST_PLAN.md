# Plan de pruebas: revisión antes de cualquier ejecución

## 1. Propuesta de cuatro documentos

| Orden | Documento | Importe y relación | Resultado esperado |
|---|---|---|---|
| 1 | Factura A, PPD | 100 + IVA 16 = 116 MXN; una partida | CFDI de ingreso de prueba y persistencia ERP |
| 2 | Factura B, PUE | 100 + IVA 16 = 116 MXN; una partida | CFDI independiente, sin REP ni NC relacionados |
| 3 | Pago y REP de A | Pago ficticio de 58 MXN, parcialidad 1 | Saldo anterior 116, insoluto 58; CFDI tipo P con total fiscal 0 |
| 4 | NC de A | 50 + IVA 8 = 58 MXN; una partida | CFDI de egreso ligado sólo a A; saldo ERP final propuesto 0 |

Son importes y modalidades **propuestos para revisar**, no datos existentes. En el REP no inventar partidas de cantidad 1: aplicar ese límite a las partidas de ingreso/egreso; el pago también queda por debajo de 116 MXN. El máximo de cuatro incluye cualquier documento emitido inadvertidamente: no crear un sustituto, un segundo REP ni un CFDI de recuperación. No efectuar transferencias bancarias, correos, cargos o cobros reales. Definir antes receptor ficticio, datos fiscales de sandbox y claves SAT válidas, sin reutilizar cliente real por conveniencia.

Después de los cuatro timbrados: PDF y XML de cada uno, cancelación de **B** con motivo 02 y refresco de su estado. B no tiene pago/NC: no intentar cancelar A con relaciones activas. Cancelar no significa aceptación; registrar el estado real y detenerse si queda pendiente. No cancelar REP/NC ni hacer limpieza fiscal adicional sin revisión específica.

## 2. Arquitectura propuesta y bloqueos previos

Ruta oficial a estudiar: `createServerFn` aislado en Preview live, con `useServerFn` y el `authAttacher` existente; reutilizar los handlers auténticos, no timbrar directamente desde un flujo SDK alterno. **No se implementa aquí.** Sin nueva Edge Function, sin reutilizar endpoints operativos, sin modificar despliegues operativos. Si el port requiere cambio semántico, detener para autorización y revisión adicionales.

Base candidata: PR438, snapshot `967ac99ce632c284fc35f9a7a62852ab4fd09dcf`, en `../facturapi6-sandbox-candidate/snapshot/supabase/functions/`:

| Capacidad | Código real requerido |
|---|---|
| Facturas A/B | `stamp-cfdi/handler.ts`, `invoiceGateway.ts` y capa compartida |
| REP | `stamp-payment-complement/handler.ts`, preparación/claim ERP reales |
| NC | `stamp-credit-note/handler.ts`, claim/relación ERP reales |
| Cancelación | `cancel-cfdi/handler.ts`, `assert_invoice_cancellable` |
| Descargas | `download-cfdi/handler.ts`; puede escribir archivos/metadatos |
| Refresco | `supabase/functions/refresh-cancellation-status/handler.ts`, **fuera del snapshot**: incorporar sólo copia QA con procedencia/digest revisados |

Bloqueos obligatorios:

1. Inventariar cierre completo de imports Deno/JSR/npm, `Deno.env`, `serve` y efectos de módulo; adaptar sólo resolución de imports, inyección de entorno/clientes y límites `Request/Response` a DTO serializable. No exportar SDK/streams/tokens por RPC. Acreditar paridad handler a handler, incluidos filtros, RPC, escrituras, fechas, errores e idempotencia. Un port a Preview **no ejecuta runtime Deno**.
2. El runner histórico no está listo: una sola factura, tres CFDI, descarga sólo XML, refresco `null`, fixtures inexistentes, fases sin conexión al entrypoint. Sus claims son por acción, no un claim único secuencial; tampoco prueba los topes leyendo partidas efectivas ni postcondiciones DB. Su README propone una nueva Edge Function: **no seguirlo**.
3. Duración hard de una petición Preview (wall-clock/CPU/proxy/desconexión) desconocida, sin garantía verificable disponible. No justificar una petición larga con tiempos observados del preflight. Preferir solicitudes manuales acotadas por etapa, secuenciales, sólo desde la misma sesión activa, sin encadenamiento automático ni reanudación. Cada etapa sólo avanza con evidencia durable de la anterior. **Diseño pendiente:** un único claim de run no acredita por sí mismo orden y exclusión entre solicitudes; revisar un diario durable de etapas y transiciones antes de implementarlo. Si no puede garantizarse con mecanismos existentes sin nuevos permisos/migraciones, detenerse; no sustituirlo por memoria del servidor ni localStorage. No prometer trabajo en segundo plano ni supervivencia a desconexiones.
4. Un claim único durable antes del primer efecto, `upsert:false`, con prefijo exclusivo y cierre irreversible. Validar atomicidad, conflictos y cierre con dobles/entorno efímero. Claims, diario y cierre implicarán escrituras técnicas futuras: **ninguna ahora**. Sin retry del run, sin reanudación después de fallo, recarga o respuesta incierta. La idempotencia del handler no equivale a exactly-once del proveedor.
5. Bloquear cualquier duplicado de etapa antes del handler; probar idempotencia del handler con dobles offline y, si se revisa una repetición real, sólo tras éxito inequívoco y como etapa explícitamente autorizada. Un 4xx genérico no basta: verificar rechazo específico de duplicado y ausencia de otra emisión/escritura. No añadir una repetición real a esta secuencia por defecto.
6. SDK operacional permanece 5.2 hasta activación aparte; el port QA fija 6.0.0 y revisa también el parche Fase 1 de recuperación de PDF de NC. PDF/XML requieren timeout efectivo: la Fase 2 observó descargas directas sin AbortSignal. No ocultar esa diferencia ni suponer que el timeout de una promesa aborta el envío.

## 3. Compuertas de seguridad de la futura ventana

- Preview live exacto ya diagnosticado, `DEV=true`; excluir Preview estático, producción y orígenes parecidos. Las guardas de UI no sustituyen las del endpoint.
- Sesión real existente; nunca token alternativo acuñado, copia de cookies ni herramientas de invocación que prioricen producción. Administrador activo, perfil y pertenencia inequívoca al tenant fijo, empresa activa; verificar en servidor antes de privilegios.
- Modo `test` antes de leer secretos; lector limitado a testkey del tenant. Exclusividad mediante función booleana ya revisada, sin secretos como parámetros/URL ni enumeración de otras llaves. Si falla o cambia configuración, cerrar. La comprobación y lectura no son atómicas: riesgo TOCTOU pendiente de revisión; no prometer garantía transaccional.
- Nueva ventana fresca, propuesta de una hora y nunca más de dos; nuevo runId sin secretos, fijado en fuente revisada. No usar el preflight cerrado. TTL y shutdown revisados tras cada await/import/loader y antes de cada consulta o efecto. Si expira no enviar operaciones nuevas; no prometer abortar operaciones enviadas sin señal efectiva.
- Manifiesto de fixtures vinculado al run y tenant, IDs creados por el run en servidor, nunca IDs arbitrarios del navegador. Releer importes/partidas/relaciones efectivos antes de emitir y validar con centavos, cantidad 1, máximo 4. Presupuesto de CFDI diferente al número de peticiones HTTP.
- Sin respuestas/logs con llaves, hash de llave, payload fiscal completo, RFC, tokens o IDs de otros tenants. Evidencia de revisión sólo estados/códigos/conteos/digests de artefactos saneados.

## 4. Pausa de procesos automáticos — futura, no aplicada

Revisar y registrar estado previo de `process-cfdi-retry-queue-5min` y `reconcile-stamping-invoices-5min`, además de cualquier consumidor que pueda tocar fixtures. Nombres/horarios históricos no prueban el estado actual. La pausa global autorizada afecta otras empresas: coordinar ventana y restauración exacta, no habilitar jobs que estaban apagados.

`reconcile-stamping-invoices` usa corte de 10 min para colas, pero la recuperación de folio REP puede intervenir sin ese corte; 50 s es su presupuesto cooperativo, **no límite hard de createServerFn**. No activar sin pausa confirmada y procedimiento de cierre ante fallo. Si se encolan fixtures o quedan inciertas, detener y revisar contención **antes de reanudar** para no provocar emisiones diferidas. Sin exclusión segura existente, mantener bloqueo y solicitar decisión, no editar consumidores ni permisos silenciosamente. La preparación actual no ejecuta SQL de cron.

## 5. Matriz de aceptación por etapa

| Etapa | Evidencia futura necesaria | Detención |
|---|---|---|
| Validación/claim/fixtures | Tenant, test, exclusividad, identidad, claim durable y filas ficticias propias | Cualquier ambigüedad o claim previo |
| Facturas A y B | UUID sandbox, ID PAC, estado timbrado, folio, fechas ISO preservadas y vínculo ERP por tenant/run | Pending/failed/timeout: no repetir creación |
| Pago + REP A | Pago ficticio, claim/preparación reales, impuestos por tasa, parcialidad/saldos, UUID/folio/estado guardados | Doble pago, monto excedido o folio incierto |
| NC A | Origen y relación correctos, importe 58, UUID/folio/archivos y saldo ERP | Relación ajena, monto duplicado o persistencia fallida |
| PDF/XML × 4 | Ocho archivos no vacíos con tipo/contenido correcto, UUID del documento, Storage/metadata y recuperación leídos desde ERP | Archivo incorrecto, vínculo cruzado o timeout |
| Cancelar B + refrescar | Motivo 02, estado real PAC/SAT y estado ERP coherente; aceptación sólo si confirmada | Pendiente/rechazo/desconexión no se convierte a éxito |
| Cierre | Cuatro CFDI como máximo, no colas peligrosas, marcador de cierre, enabled false/shutdown true, crons restaurados a estado previo | No afirmar cierre completo si queda algún punto incierto |

Comprobar persistencia a través de las lecturas reales del ERP, no sólo status HTTP del handler. Revisar factura, pago/REP, NC, folios, saldos, fechas y archivos de cada fixture. No cambiar registros históricos para acomodar la prueba.

## 6. Pruebas offline previas del futuro ejecutor

Una prueba concreta por regla: tenant ajeno, live rechazado antes del lector, sesión/admin/pertenencia inválidos, orígenes falsos, TTL durante imports/lector/verificador, shutdown durante etapa, claim 409/timeout/cierre incierto, concurrencia/desorden/recarga, quinto CFDI, monto 116.01, cantidad 2, archivos tardíos y persistencia fallida después de respuesta PAC. Dobles deben afirmar consultas/filtros y RPC exactos, cero proveedor ante bloqueo, nada de claves en URL o respuesta. Probar refresh real adaptado y cancelación pendiente sin éxito inventado. Ejecutar sólo archivos focales en Lovable; suite completa en GitHub Actions, no tests de escritura contra producción.

## 7. Revisión y reporte final

Revisor debe aprobar cierre de imports/manifiesto, adaptaciones semánticas si existen, claims/diario, topes reales, pausa/cierre, timeout y ventana. Mientras tanto: **NO-GO**. No se solicita despliegue operativo ni migración para completar este documento.

Al ejecutar después de aprobación: registrar SHA exacto y ventana UTC/hora de Ciudad de México, resultados por etapa, conteo CFDI, persistencia, archivos y estado de cancelación; nunca credenciales. Distinguir evidencia offline, sandbox real en Preview y pendiente Deno/producción/CI. Al finalizar o fallar, cerrar run sin extenderlo; conservar trazabilidad, no borrar fixtures/claims ni aplicar recuperación SQL por defecto. La activación productiva todo de una vez con reversa por redeploy pertenece a Fase 4, fuera de este paquete.