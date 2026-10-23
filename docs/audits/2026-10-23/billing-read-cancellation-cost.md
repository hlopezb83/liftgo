# D4 / B3: cancelación y caracterización de lecturas

## Alcance y decisión

D4 incorpora cancelación real al historial del formulario. La señal de TanStack Query llega a PostgREST en las cuatro fuentes: facturas directas, pivotes, extensiones y devoluciones. Se comprueba antes y después de cada página; una respuesta tardía tampoco permite devolver evidencia parcial ni iniciar otra página. Al desmontar el último consumidor, Query cancela las peticiones activas. Si otro consumidor comparte la consulta, su ciclo de vida compartido sigue gobernado por Query.

No cambian claves, filtros, orden, proyecciones fiscales, tamaño de página (1.000), límite defensivo (100 páginas), reglas de elegibilidad ni payload. No se restringe todavía la historia a candidatos: una optimización así requeriría demostrar historia completa por reserva y claves con su scope. Los errores parciales siguen bloqueando la selección afectada; no se confunden con ausencia de deuda.

B3 sólo añade pruebas y medidas sobre `buildPlan` real, importable gracias al cambio B1. No cambia la orquestación productiva. La optimización por lotes está **condicionada y pendiente de medición de volumen/latencia reales**, no demostrada como necesaria ni descartada definitivamente. No se eliminan revalidación al ejecutar ni RPC transaccional, no hay nuevas RPC, cachés o colas.

## Medición sintética D4

El test `useBookingBillingEvidence.transport.test.tsx` usa React, QueryClient y el cliente Supabase/PostgREST reales. Sustituye únicamente fetch por respuestas ficticias. Las cuatro fuentes contienen igual cantidad de filas; cada factura lleva una partida fiscal completa. `responseBytes` suma UTF-8 del JSON servido por el transporte falso, sin cabeceras, compresión ni TLS. El tiempo es wall time local hasta observar éxito del hook e incluye render y polling del test; **no es latencia de producción ni benchmark comparativo**.

Los conteos y bytes son deterministas; los tiempos varían con runtime/carga. Cada ejecución imprime `BILLING_READ_FIXTURE` con filas/fuente, peticiones, bytes y milisegundos. Una página llena requiere la siguiente consulta, incluso si ésta resulta vacía.

| Filas por fuente | Peticiones | JSON UTF-8 total | Wall time local de una ejecución |
| ---: | ---: | ---: | ---: |
| 1 | 4 | 961 B | 55.513 ms |
| 100 | 4 | 96.334 B | 58.426 ms |
| 1.000 | 8 | 970.242 B | 67.23 ms |
| 1.001 | 8 | 971.216 B | 131.537 ms |
| 5.001 | 24 | 4.883.232 B | 261.796 ms |

Con 3.001 filas por fuente, el recorrido completo requeriría 16 peticiones. Desmontar con la primera página pendiente inicia sólo 4 y cancela las 4; hacerlo en la segunda inicia sólo 8 y cancela las 4 activas. Se verifica que no aparece una página posterior ni se cachean claims incompletas.

Cobertura adicional: señal ya abortada, respuesta tardía corta o llena, interrupción en página 2, error tras una página correcta, límite defensivo, enlace directo+pivote fuera de página 1, igualdad de campos fiscales y scope. Los errores parciales de claims/extensiones bloquean candidatos y handlers; el de devoluciones bloquea una reserva recurrente completada, sin bloquear facturas ajenas.

## Medición sintética B3

`queryCost_test.ts` ejecuta el planificador productivo con respuestas de base ficticias, fecha explícita y un periodo por reserva. Se verifica el importe y periodo de cada item, ausencia de escrituras y scope organizacional del historial. El caso de cotizaciones distintas usa respuestas completas válidas, no un camino de error que omita trabajo.

| Reservas B | Q=0 | Q=1 compartida | Q=B distintas |
| ---: | ---: | ---: | ---: |
| 1 | 4 | 5 | 5 |
| 100 | 202 | 203 | 302 |
| 1.000 | 2.002 | 2.003 | 3.002 |

Cada cifra incluye selects y RPC de lectura. En estos fixtures hay clientes: `2 + 2B + Q`. Sin clientes el término de precarga no aplica. La caché del plan evita repetir disponibilidad de una cotización compartida, pero no elimina las dos lecturas por reserva. Son viajes lineales, no crecimiento exponencial.

El test imprime `RECURRING_READ_FIXTURE` con B, Q, selects, RPC de disponibilidad, total y tiempo. El tiempo sólo cubre CPU/orquestación con promesas locales: no hay red ni base; no extrapolarlo a tiempos reales. Tampoco se mide el coste de ejecutar/crear facturas, que conserva su revalidación independiente.

## Protocolo mínimo de medición real pendiente

1. Elegir una organización y un entorno autorizados para diagnóstico; comenzar por prueba/QA. Registrar únicamente un rótulo de muestra, versión, fecha, B (reservas candidatas), Q (cotizaciones distintas válidas), cantidad de filas/páginas y resultado éxito/error/cancelación. No guardar IDs, nombres, RFC, conceptos, importes, documentos, tokens ni cuerpos HTTP.
2. Para D4, observar una apertura representativa y una salida temprana del formulario. Medir tiempo hasta evidencia lista, peticiones iniciadas/completadas/canceladas y bytes agregados de las cuatro fuentes. Usar las herramientas de red existentes, anotando si el tamaño es transferido/comprimido o decodificado. No exportar HAR ni respuestas privadas. Distinguir caché caliente/fría y no limpiar cachés de otros usuarios.
3. Para B3, medir sólo preview, sin ejecutar facturas. Usar métricas diagnósticas ya disponibles. Si no existe contador de lecturas, una ejecución diagnóstica expresamente autorizada puede envolver temporalmente el cliente con contadores y reloj en memoria; sin logs de payload, credenciales, nuevo almacenamiento ni cambio permanente de telemetría. No instrumentar producción ni consultar la base como parte de este parche. Registrar duración total, B/Q y errores; separar la latencia del transporte del cálculo si el entorno lo permite.
4. Repetir sobre muestras de volumen habitual y alto observado, no asumir que 1.000 reservas existen. Comparar distribución/variabilidad con un objetivo de respuesta acordado y con los límites reales del endpoint. No inventar un umbral de servicio a partir del fixture.
5. Si el coste observado lo justifica, proponer un lote acotado de historial/disponibilidad con igualdad exacta de preview y fail-closed ante cualquier lote incompleto. Preservar organización, enlaces directos+pivote, cancelaciones, selección manual y revalidación transaccional al crear. Si no lo justifica, conservar esta caracterización y reabrir cuando cambie el volumen; no declarar que el patrón nunca importará.

## Verificación y límites

Resultados locales: Node 24.19.0, Vitest 4.1.11, TypeScript 6.0.3 y Deno 2.9.6. **130 tests pasan en 10 suites UI/dominio** y **9 tests Deno pasan con comprobación de tipos**. TypeScript dirigido a los tres archivos UI modificados y sus dependencias pasa; ESLint pasa sin advertencias. Deno fmt/lint, `arch:check` G1–G5 y `git diff --check` pasan. No se ejecutó typecheck global, suite global ni build.

En B3, con 1/100/1.000 reservas y cotizaciones distintas, una ejecución local registró 0.372/4.515/34.259 ms. Estos valores de promesas en memoria no incluyen RTT ni servicio de base, y no son comparables con producción.

Validación local offline con dependencias ya existentes, sin instalaciones. El test Deno usa `node:assert/strict` incorporado; no necesita descargar std/assert. Para la ejecución local se mapea sólo la URL del SDK Supabase al paquete ya instalado, mediante import map fuera del repositorio. El grafo remoto exacto queda para CI. No se ha ejecutado SQL, PAC, escritura remota, deploy ni auditoría del entorno publicado.

Comandos dirigidos: Vitest con un worker para evidencia, formulario/periodos, devoluciones, moneda y cargos; Deno `test --cached-only --allow-env --allow-read` para `queryCost_test.ts`; ESLint de los archivos UI cambiados; `deno fmt --check` y `deno lint` del test Edge. No se afirma que una ejecución dirigida equivalga a la suite global/build.
