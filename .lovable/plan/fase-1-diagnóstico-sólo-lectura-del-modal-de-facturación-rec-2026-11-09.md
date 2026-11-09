# Fase 1 — Diagnóstico (sólo lectura) del modal de facturación recurrente

## Resultado principal
El volumen de datos de ELOGISTIX SHIPPING es mínimo, así que **la espera de 2.3–3.8 s no viene del tamaño de los datos ni de índices faltantes**. Lo más probable es la suma de viajes secuenciales (función → base de datos) y el arranque de la función. Esto es inferencia; falta medir por fase.

## (1) Identidad y versión
- Checkout: `731a14e10cc45142f068de4234c5457c2057d99b` (coincide con la fuente auditada).
- `generate-recurring-invoices/index.ts` SHA256 `d6b7fb8c…db7d1` (sólo reexporta `handler.ts`).
- Último despliegue registrado en esta conversación: 2026-11-08 19:53–19:54 UTC, paquete `60e44d94…295167`. La plataforma no expone hash/versión activa remota: **no verificable**.
- Migraciones: última aplicada 0133 (`control0132_verified_release`); ninguna toca la ruta de planificación recurrente desde 0127–0130.

## (2) Conteos agregados (una ejecución, medido)
| Métrica | Valor |
|---|---|
| Reservas confirmed + recurring_billing | 2 |
| Clientes fiscales distintos | 2 |
| Cotizaciones distintas | 1 |
| Historial por pivote (filas / facturas) | 4 / 4 |
| Historial directo (booking_id) | 4 |
| Facturas únicas combinadas | 4 |
| Tamaño agregado `line_items` | ~981 bytes |
| Contexto: reservas / facturas de la empresa | 36 / 39 |
| Contexto global: reservas / facturas | 77 / 186 |

Nota: la empresa se ubicó por `company_settings` (el nombre de `organizations` no contiene "ELOGISTIX"). No se devolvieron IDs ni filas.

## (3) Índices instalados (medido)
Existen índices que cubren cada filtro de la planificación:
- bookings: `organization_id`, `(organization_id, customer_id)`, `quote_id`, `customer_id`.
- invoice_bookings: `booking_id`, `invoice_id`, `organization_id`, PK `(invoice_id, booking_id)`.
- invoices: `booking_id`, `organization_id`, `(organization_id, customer_id)`, GIN `line_items`, período recurrente.
- organization_customers: listado truncado; no confirmado el índice `(organization_id, customer_id)` → pendiente de verificar.
- No existe índice parcial `bookings(status, recurring_billing)`; con 77 filas totales es irrelevante hoy.
- EXPLAIN (sin ANALYZE) no ejecutado aún; con estas cardinalidades cualquier plan será < 1 ms.

## (4) Métricas y locks (medido / limitado)
- Estadísticas de consultas lentas: ninguna consulta de la planificación (bookings recurrentes, pivote, `organization_customers` por lote, `get_quote_charge_availability`) aparece en el top 15 por tiempo total. La más cercana (`organization_customers` + `customers`, media 91 ms) es de otra pantalla.
- `pg_stat_statements` no es consultable directamente con mi acceso; sólo el resumen top-N.
- Locks en este momento: 0 esperas por lock, 2 sesiones activas de 23. Es una foto puntual, no histórica.
- Logs de la función: sólo eventos de arranque (32–37 ms) y apagado; **no hay registro de duración por solicitud ni por consulta**.

## Inferencia sobre la espera
La vista previa hace en serie, como mínimo: verificación de sesión/rol → reservas (con `count: exact`) → datos fiscales por lote → pivote → historial directo → `get_quote_charge_availability`. Son ~6–8 viajes ida y vuelta; a 150–400 ms cada uno (red + PostgREST + RLS) suman 1.5–3 s, más arranque en frío en la primera llamada (4.3 s vs 2.6 s posteriores encaja con esto).

## Limitaciones exactas
- Sin tiempos por fase dentro de la función (falta instrumentación).
- Sin hash activo de la función desplegada.
- Sin `pg_stat_statements` detallado ni historial de locks.
- No se ejecutaron SELECT equivalentes cronometrados ni EXPLAIN.

## Siguiente paso propuesto (requiere su aprobación)
1. Ejecutar una sola vez EXPLAIN sin ANALYZE de los 5 SELECT equivalentes y confirmar índice de `organization_customers`.
2. Fase 2 (con autorización aparte): añadir tiempos por fase en los logs de la función (sin datos de negocio) para confirmar qué viaje pesa más, antes de optimizar.
