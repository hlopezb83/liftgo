# Auditoría y paralelización de Calidad · 2026-11-09

## Hallazgo y medición base

Fuente: [run 42683471455, job 129383918942](https://github.com/hlopezb83/liftgo/actions/runs/42683471455/job/129383918942), PR #433. GitHub reportó **725 s (12 min 05 s)** para `Calidad (lint, tipos, build y arranque)`, con resultado correcto. Los tiempos siguientes provienen de los timestamps de pasos de Actions, no de sumar tiempos de tests ejecutados en paralelo.

| Trabajo | Segundos |
| --- | ---: |
| Preparación y contratos anteriores a lint | 25 |
| ESLint | 71 |
| ESLint Group C | 1 |
| Tipos aplicación + navegador | 35 + 11 |
| Arquitectura | 1 |
| Build real con backend ficticio | 17 |
| Chromium | 16 |
| Comprobaciones de aislamiento | 3 |
| Smoke de arranque | 32 |
| Aceptación móvil | 54 |
| Nueva factura | 67 |
| Cotizaciones | 71 |
| Inventario | 14 |
| Reservas | 82 |
| Group C aplicación | 145 |
| Group C componentes | 67 |
| Artifacts y cierre | 13 |

Las ocho suites de navegador sumaban **532 s**, encadenadas en el mismo runner. No era un atasco de instalación: la caché coincidió exactamente y `bun install` tardó aproximadamente 545 ms. El build costó sólo 17 s. Las suites reportaron 192 pruebas aprobadas y dos saltos preexistentes en reservas.

Vitest y cobertura habían terminado a los **3 min 57 s** desde la creación del run: el shard más largo duró 183 s y el job merge 46 s, con 8 s de preparación/colas. La ejecución de merge en sí duró 6 s; los 792,67 s impresos por el reporter eran duración acumulada de shards, no otra ejecución de toda la suite. No se modifica Vitest ni su contrato de procedencia.

## Qué se mantiene y por qué

- Smoke usa el bundle/Worker real: SSR, hidratación, interacción, CSS e imágenes, inicialización de Sentry e identidad de release. Comprueba login y recuperación de contraseña sin mezclar una sesión anterior. Un build o un HTTP 200 no cubren estas regresiones.
- Las demás suites prueban aplicación/componentes reales en Chromium con respuestas sintéticas y red externa bloqueada. **No acreditan integración con una base real ni operaciones fiscales.** Mantienen sus viewports de 360/390/1440 según configuración.
- Group C componentes no son sólo imágenes históricas: hay consentimiento de periodos futuros, selección consecutiva, reinicio al cerrar, firma con píxeles reales, touch, DPR y PNG. No se elimina el carril entero para ahorrar 67 s.
- No se modifican tests, mocks, retries, workers, condiciones de skip, umbrales de cobertura, filtros de ramas/rutas ni reglas de protección. No se agrega un schedule.

## Cambio

1. `quality-static` ejecuta todos los controles estáticos independientemente del build.
2. `quality-build` produce **un solo** build ficticio, verifica aislamiento y smoke, y comparte únicamente `dist` comprimido.
3. Cinco runners de aceptación reutilizan sus bytes verificados con SHA-256: móvil/factura, cotizaciones/inventario, reservas, Group C aplicación y componentes. Nunca ejecutan servidores incompatibles en paralelo dentro del mismo runner.
4. El check histórico `Calidad (lint, tipos, build y arranque)` queda como gate: exige éxito de estático, build y **toda** la matriz. `failure`, `cancelled` y `skipped` son fallos del gate.
5. Evidencia diferenciada por carril/run/intento. No se pierde la evidencia existente y se conservan capturas de factura también al pasar.

El nombre del artifact se publica como output del productor junto con su hash. Un retry de un consumidor toma ese nombre, no recalcula el intento usando su propio `github.run_attempt`. Retención de siete días; tras expirar, reconstruir. El contrato separado de blobs Vitest sigue exigiendo reejecutar todos sus shards.

El intercambio suma runners, instalaciones calientes y transferencia de un build. Reduce espera de pared, no garantiza reducir minutos facturables. La estimación inicial es aproximadamente 4–5 minutos sin colas largas, frente a 12 minutos; se debe contrastar con una corrida remota completa antes de afirmar una mejora medida.

## Revisión y límites

- Revisión independiente detectó un fallo de reintentos parciales por nombre de artifact. Corregido mediante output del productor y regresión productor intento 1 / consumidor intento 2.
- Los contratos ejecutan el shell real de empaquetado, verificación y gate; rechazan digest ausente/incorrecto, bytes corruptos y estados distintos de éxito. También detectan suites omitidas y condiciones que anulan un carril.
- Rulesets devolvió `[]`. La consulta de branch protection devolvió 403 por falta de permiso administrativo; no es evidencia de ausencia de checks requeridos. Se preserva el nombre y no se alteran ajustes.
- No toca los cambios funcionales de los PR #432 y #433 ni otros PR abiertos. No despliega ni migra bases de datos.
- La medición remota de la propuesta queda pendiente hasta abrir el PR y completar CI.

## Validación local de la propuesta

- 161/161 contratos de release, lint, arquitectura, blobs, tipos navegador, migraciones, lifecycle y nuevo DAG aprobados. El contrato específico de calidad tiene 12 casos, incluidos fallos negativos.
- ESLint global y Group C, tipos de aplicación/navegador, arquitectura, parseo YAML y `git diff --check` correctos.
- Build ficticio correcto con Node 24.22.1 y dependencias congeladas coincidentes. CI mantiene sus pins Node 26.13.0/Bun 1.4.4 sin cambios.
- El smoke y el contrato Chromium locales **no se acreditan como aprobados**: Chromium no pudo crear su socket Unix por la restricción del contenedor (`Operation not permitted`), también en el intento de ejecución autorizada. No se modificaron harness ni pruebas para eludir esa restricción. Deben pasar en Actions; no se integra antes.
