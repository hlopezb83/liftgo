# Revisión de restauración · NO-GO antes de la pausa

## Evidencia del 10 de noviembre de 2026

- npm `https://registry.npmjs.org/facturapi/latest` devuelve `6.0.0`.
- Sólo metadatos de la base: `pg_cron` versión `1.6.4`; `cron.launch_active_jobs=on`, `cron.max_running_jobs=32`, `cron.use_background_workers=off`.
- Fuente primaria: [README de pg_cron](https://github.com/citusdata/pg_cron). Documenta que una ejecución puede quedar en cola; no ejecuta jobs mientras el servidor está en hot standby. La configuración puede deshabilitar todos los jobs activos.
- Estas lecturas no ejecutaron funciones fiscales, no consultaron llaves ni modificaron datos.

## Límite que impide avanzar con el plan aprobado

No existe en las fuentes consultadas una garantía de que una tarea SQL de restauración se complete antes de 60 minutos. Registrar una tarea antes de pausar ayuda a sobrevivir al cierre del chat, pero no garantiza su ejecución puntual ante indisponibilidad, colas o fallas de conexión. El estado actual `on` no garantiza disponibilidad futura.

El plan aprobado exige detener **antes** de la pausa cuando esa garantía no esté disponible. Por ello no se generó ni ejecutó un procedimiento que se presente como garantía; tampoco se aplicó el kit o desplegó ninguna función. El SDK operativo local sigue en estado base 5.2.0 y el preflight temporal permanece apagado.

## Alternativa soportada, pendiente de decisión

Una restauración SQL temporal puede ser una protección de mejor esfuerzo, no un límite duro. Si el usuario acepta expresamente esa diferencia y dispone de supervisión durante toda la ventana:

1. Preparar fuera del despliegue un procedimiento transaccional que capture exactamente los dos jobs, IDs, nombres, usuario/base y estados previos; rechazar ambigüedades, corridas en curso o cambios concurrentes detectados.
2. Registrar la restauración antes de pausar, en la misma transacción, con margen antes del minuto 60. Restaurar sólo jobs pausados por ese run y conservar inactivos los que ya lo estaban.
3. Conservar instrucciones de cierre manual y limpieza del job temporal, identificadas por run; ante fallo, conservar una forma de volver a intentar únicamente la restauración, nunca la emisión fiscal.
4. Pruebas aisladas con catálogo ficticio: rollback si falla registro/pausa, estado mixto, IDs sustituidos, cierre temprano, limpieza y resultados inciertos. Revisar de forma independiente antes de SQL productivo.
5. Durante una ventana fresca, el agente cierra las tareas al terminar su intervención; el respaldo programado no sustituye la verificación del cierre. No prometer acciones que continúen en segundo plano después de terminar el turno.

No se ha preparado todavía este SQL: cambiar de límite duro a mejor esfuerzo requiere una decisión explícita, no se deduce de «migra» ni de la aprobación que pidió detenerse si faltaba la garantía.