# Recurrent planner: separación y lecturas por lotes

## Alcance

Reconstrucción nueva sobre `8f8071ff5c2bfb6d76c30dc81d9062ee7c66bf3b` de main. No es recuperación ni rebase del parche local anterior `e3807ae`, que no estuvo disponible. La validación de aquel parche no se reutiliza.

- `planningData.ts`: frontera de lectura. Agrupa por organización y por lotes de 100 identidades; pagina reservas, relaciones fiscales e historial directo/pivote con orden estable y `count=exact`.
- `planner.ts`: planificación determinista con fecha explícita, sin cliente de base de datos ni reloj. Conserva cobertura canónica, prorrateo, límite de 24 períodos, anticipación explícita, reglas de elegibilidad y huellas comerciales/fiscales.
- `planTypes.ts` y `planFingerprint.ts`: contratos y utilidades compartidos por planificación y ejecución.
- `handler.ts`: mantiene su API `buildPlan`, autenticación, selección y ejecución. No cambia el RPC de creación atómica ni sus protecciones de concurrencia.
- Sin migraciones, permisos, cambios de datos, automatización de facturas ni despliegue.

## Lectura completa y aislamiento

Cada lote fiscal e histórico se filtra por la organización propietaria de sus reservas. Las respuestas se validan por identidad y organización antes de construir el plan. El historial directo y por pivote se combina por reserva y se deduplica por factura, conservando las reglas existentes de cancelación fiscal aceptada.

Cada consulta pide páginas de hasta 500 filas. Si el servidor devuelve un límite inferior, se continúa mediante el último identificador recibido (tupla reserva/factura para el pivote), no mediante desplazamientos. Se comprueba que el conteo restante coincida con el inicial menos las filas ya recibidas y que las identidades sean estrictamente crecientes. Un conteo ausente o inconsistente, una página vacía antes del total, filas duplicadas o una identidad fuera del lote bloquean la vista previa en vez de interpretar un historial incompleto como períodos pendientes.

Los lotes de cargos validan que estén presentes exactamente las cotizaciones solicitadas. Una respuesta de lote incompleta bloquea sus cotizaciones; un contenido inválido de una cotización no bloquea otra con contenido válido. Cada huella usa únicamente el snapshot de su propia cotización, no las demás cotizaciones del lote.

Se aborta sin plan parcial al superar 50.000 filas o 1.000 páginas de lectura. Son límites de cardinalidad, no garantías de memoria ni tiempo: los payloads y hasta 24 períodos por reserva tienen tamaños variables. La regresión de borrado antes del cursor e inserción posterior con igual cardinalidad falla de forma segura.

Esto no crea una transacción de lectura: cambios concurrentes de contenido o sustituciones enteramente detrás del cursor no son detectables sólo con el conteo. La generación conserva la relectura, comparación de huellas y validaciones atómicas existentes del servidor. No se presenta la paginación como garantía de snapshot transaccional.

## Evidencia local

- 126 pruebas Deno offline de `generate-recurring-invoices`, excluyendo `index_test.ts` (smoke de servicio).
- Incluyen 18 pruebas nuevas con el SDK Supabase real 2.118.0 y transporte HTTP simulado: sintaxis de consultas, conteos, orden, filtros, historial de 1001 filas con límite de 200 por página, separación multiempresa, identidad de facturas/cotizaciones, fallos de integridad y determinismo sin mutación.
- Regresiones existentes conservadas: anticipación consecutiva, bloqueo al saltar un pendiente, fallo de un mes que bloquea dependientes, cancelación que reabre cobertura, prorrateo, moneda, agrupación, selección y autenticación.
- Deno fmt/lint de los 12 archivos afectados, `tsc --noEmit`, `arch:check` y `git diff --check`.
- El runner local usa Deno 2.9.6 y un import map temporal fuera del repositorio para resolver el mismo SDK 2.118.0 desde su paquete oficial instalado. No reemplaza el SDK por un stub ni cambia el import map del producto.
- La suite offline completa no pudo iniciar localmente: faltaba en caché `https://esm.sh/zod@4.6.7`. CI debe ejecutar la suite canónica antes de integrar. No se validó RLS contra base real ni latencia de producción.

## Caracterización de consultas, no benchmark de producción

Fixtures sin historial, una organización y un cliente fiscal compartido. El SDK mock cuenta solicitudes, no costo SQL ni latencia real.

| Reservas | Cotizaciones | SELECT nuevos | RPC de cargos nuevos | Total previo | Total nuevo |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | ninguna | 4 | 0 | 4 | 4 |
| 100 | distintas | 4 | 1 | 302 | 5 |
| 1000 | ninguna | 23 | 0 | 2002 | 23 |
| 1000 | compartida | 23 | 1 | 2003 | 24 |
| 1000 | distintas | 23 | 10 | 3002 | 33 |

Los lotes fiscales adicionales, las organizaciones y las páginas de historial agregan solicitudes. El `count=exact` también tiene costo en el servidor; la reducción de round trips no prueba por sí sola una mejora de latencia.

## Reproducción

Usar la selección offline de `scripts/deno-test-selection.sh`; `index_test.ts` requiere el servicio de pruebas y queda fuera del runner offline. Para el conjunto focalizado, ejecutar los archivos `*_test.ts` de `supabase/functions/generate-recurring-invoices` excepto ese smoke.

La revisión independiente y CI del SHA exacto de la PR son condiciones adicionales antes de fusionar. No se publica producción desde este trabajo.

Revisión independiente del delta final: 126/126 pruebas aprobadas; sin bloqueos adicionales. Confirmó la conservación de las reglas y el cierre del salto por offset. La limitación de snapshot transaccional y de presupuesto por bytes/tiempo permanece explícita.
