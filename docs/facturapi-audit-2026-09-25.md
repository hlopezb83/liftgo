# Auditoría final de Facturapi — 25 de septiembre de 2026

Alcance: código del SDK `facturapi@5.1.0`, funciones fiscales, conciliación, cola de reintentos y llamadas desde la UI. Revisión contra [API oficial](https://docs.facturapi.io/api/), [intermitencias 202](https://docs.facturapi.io/docs/guides/invoices/intermitencias/), [errores](https://docs.facturapi.io/docs/getting-started/errors/), [límites de tasa](https://docs.facturapi.io/docs/getting-started/rate-limits/) y [SDK oficial](https://github.com/FacturAPI/facturapi-node).

## Resultado de esta corrección

| Área | Estado comprobado |
| --- | --- |
| Factura, nota de crédito y REP | Una respuesta `202 pending` conserva el ID remoto, deja el documento en `stamping` y no descarga XML/PDF ni anuncia un UUID inexistente. |
| Conciliación | Consulta primero `invoices.retrieve(id)` si ya hay ID; en su defecto busca por `external_id` exacto. `pending` no consume intentos; `valid` con UUID se recupera; `failed` queda para revisión manual. |
| Cola de reintentos | Reconoce CFDI remoto `pending` y evita una segunda emisión. Un resultado ambiguo o una búsqueda fallida difieren el reintento. |
| UI de notas de crédito | Conserva la nota local si el timbrado falla o queda pendiente, porque el PAC podría haber aceptado el CFDI. |
| Límite de tasa | Las lecturas reintentan un `429 rate_limit_exceeded` sólo cuando `Retry-After` cabe dentro del presupuesto corto; los plazos largos se difieren. |
| Pruebas | Casos de `202` en los tres handlers, clasificación `pending/valid/failed`, recuperación por ID, coincidencia exacta y protección de la nota local. |

## Controles que ya existían y se verificaron

1. Cada documento lleva `external_id` e `idempotency_key` derivados de su UUID local.
2. Las llaves `test` y `live` se resuelven desde `billing_secrets` de la organización; el fallback global sólo está disponible con una única organización. Se rechaza reutilizar una misma llave en dos organizaciones.
3. Los handlers comprueban la organización del documento y la membresía antes de llamar a Facturapi. La conciliación agrupa documentos por empresa.
4. Las cancelaciones usan el ID remoto y consultan el estado posterior del SAT; los claims locales impiden solicitudes concurrentes.

## Riesgos y pasos operativos que permanecen

1. **`failed` exige revisión humana.** El ID remoto queda guardado y los handlers bloquean otra emisión automática. Antes de reemitir hay que confirmar el estado en Facturapi y definir un procedimiento auditado para liberar el ID y la clave de idempotencia. No se automatizó esa decisión fiscal.
2. **Verificación en Lovable Cloud.** Las pruebas locales simulan la API oficial; hace falta ejecutar un caso de sandbox por organización después de desplegar las funciones y confirmar que el cron de conciliación corre allí. No se emitió un CFDI real durante esta auditoría.
3. **Webhooks opcionales.** Facturapi recomienda `invoice.status_updated` como alternativa a consultar `retrieve`. El cron existente es suficiente para consistencia eventual; un webhook firmado reduciría la latencia de un `pending`, pero requiere despliegue y manejo de secretos adicionales.
