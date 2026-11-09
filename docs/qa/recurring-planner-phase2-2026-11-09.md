# Planificador recurrente: optimización conservadora (fase 2)

Base de comparación: `731a14e10cc45142f068de4234c5457c2057d99b`.

## Dependencias verificadas antes de reducir payload

- `invoiceHistory.ts` decide ocupación fiscal con `status`, `cfdi_status`, `cfdi_uuid` y `cancellation_status`. Esos campos se conservan sin cambios.
- Cobertura usa `billing_period_start/end`; la huella del historial usa `id/start/end`. No consume `invoices.line_items`.
- Se omite únicamente `line_items` en las lecturas históricas directa y por `invoice_bookings`. No se deducen períodos desde descripciones: historial sin fechas válidas sigue bloqueado.
- Se conservan íntegros `quotes.line_items`, `rental_meta`, la validación de descuentos y el RPC `get_quote_charge_availability`. Esos datos sí intervienen en disponibilidad de cargos y en la huella comercial.
- `executePlan` conserva su relectura fiscal y de cargos por grupo, comparación de huellas, bloqueo de meses dependientes y RPC atómico `create_recurring_invoice`. Sin cambios SQL, locks, permisos ni migraciones.

## Cómputos reutilizados

La unión de cobertura se prepara una sola vez por reserva y se usa para enumerar períodos y comprobar cada candidato. La preparación es perezosa: reservas fuera del alcance conservan el retorno temprano. `null` significa historial ambiguo, nunca cobertura vacía.

La huella fiscal se calcula perezosamente para el primer período elegible y se reutiliza sólo dentro de esa reserva y llamada. No existe caché global ni entre organizaciones/solicitudes. La huella comercial completa continúa calculándose por período con idéntico contenido y orden.

No se modifican el tamaño de lotes, la paginación keyset, los conteos exactos restantes ni los presupuestos de 50.000 filas/1.000 páginas. Permanecen los límites de snapshot transaccional y payload variable documentados en la fase anterior.

## Paridad y errores

- 326 pruebas Deno focalizadas, incluidos 195 snapshots de plan completo/errores capturados del commit base antes de modificar producción; cada caso conserva importes, períodos, elegibilidad, huellas y ausencia de mutación.
- Revisión independiente: 1.600 planes diferenciales idénticos al código extraído del commit base, incluyendo estado fiscal cambiado entre llamadas. Verificó también la procedencia de los 195 hashes golden.
- Transporte HTTP con SDK Supabase real 2.118.0: proyección efectiva sin `line_items`, no un mock que devuelve columnas omitidas. Cubre 1.001 filas por cada ruta con páginas de 200, mantiene cotizaciones y compara planes completos.
- Regresiones conservadas: separación multiempresa, identidad de relaciones, conteos/páginas inválidos, cambios concurrentes de cardinalidad, sustitución antes/después del cursor, estados de cancelación, anticipos consecutivos y fallo previo que bloquea dependientes.
- Deno lint, check focalizado, TypeScript y comprobación de arquitectura. El SDK local se resuelve con un mapa temporal al mismo paquete oficial y sus declaraciones; no se cambia la configuración del producto ni se reemplaza el SDK por un stub.

## Alcance de rendimiento

Fixture artificial de 1.001 facturas por ruta con partidas voluminosas: bytes de respuesta histórica estimados por serialización del transporte bajan de 8.814.838 a 546.578 (93,8%). No representa la distribución de producción. No se añade serialización de medición al código productivo.

La sesión publicada medida contiene pocos datos. Reducir payload y trabajo repetido mejora el caso de escala, pero por sí solo no demuestra eliminar la latencia actual. Los tiempos de red, SQL, SDK, arranque de función y render no son equivalentes; deben separarse mediante instrumentación antes de atribuir la espera.

Sin despliegue, cambios de datos, ni prueba fiscal real desde esta fase. Los ensayos locales no sustituyen pruebas RLS reales ni CI del SHA final integrado.

### Comparación independiente del planner puro

Deno 2.9.6; seis pares de calentamiento y quince pares medidos por tamaño, alternando base/optimizado. Una reserva con historial desordenado/solapado anterior a 24 períodos pendientes. Preparación, comparación exacta de planes y comprobación de mutación fuera del cronómetro.

| Historial | Períodos | Mediana base | Mediana optimizada |
| --- | ---: | ---: | ---: |
| 1.000 facturas | 24 | 110,664 ms | 17,223 ms |
| 5.000 facturas | 24 | 457,364 ms | 47,794 ms |

Todas las salidas coincidieron. Muestras y rangos completos en `recurring-planner-phase2-benchmark-2026-11-09.json`. Es una carga artificial y CPU/memoria de entorno compartido, sin GC forzado; no mide SQL, red, cold-start ni latencia productiva.

### Diagnóstico opcional de lecturas

Los hooks del loader reciben un colector por solicitud. Miden espera de consultas y RPC, páginas, filas y cantidad de cotizaciones por fases fijas. No serializan payloads ni incorporan identificadores, errores o datos fiscales a métricas. Sin colector, la secuencia de consultas es la misma. Prueba de paridad de contexto, URLs consultadas, contadores y fallo de lectura con diagnóstico activado.

Con módulo de métricas y hooks del loader: 332 pruebas Deno focalizadas, incluida verificación de tipos, y 53 pruebas Vitest de historial, selección, modal y hooks. Es evidencia local de esos módulos; los hooks HTTP/CI del conjunto se verifican por separado antes de publicar.
