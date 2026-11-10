# Ventana supervisada · Activación de Facturapi 6.0.0

Duración máxima: **60 minutos** desde el inicio del run-id. Si se excede, se revierte y se reanudan las tareas automáticas.

Analogía: es cambiar el motor del camión en una parada programada. Antes de salir a la calle damos cuatro vueltas de prueba con la empresa de pruebas (ELOGISTIX en modo test). Si algo suena raro, volvemos a poner el motor anterior, que está guardado y numerado en `rollback/`.

## Qué autorizas al abrir la ventana

1. Cambiar las funciones fiscales del backend a Facturapi 6.0.0 para **todas las empresas a la vez** (no hay interruptor por empresa; la reversa es volver a desplegar 5.2.0).
2. Pausar como máximo 60 minutos dos tareas automáticas que afectan a todas las empresas: reintentos de timbrado (`process-cfdi-retry-queue-5min`) y reconciliación (`reconcile-stamping-invoices-5min`).
3. Emitir en ELOGISTIX (tenant `fc2c10e3-278b-4899-8aa1-f802752f1c38`, modo test) como máximo 4 CFDI de prueba, según `../facturapi6-phase3/TEST_PLAN.md`: Factura A PPD ($100 + IVA = $116), Factura B PUE ($116), REP de A por un pago ficticio de $58 (parcialidad 1) y NC de A ($50 + IVA $8 = $58), partidas con cantidad 1. Cancelar B con motivo 02, refrescar su estado y descargar PDF/XML de los cuatro. El máximo de 4 incluye cualquier documento emitido por error: no se crea sustituto, segundo REP ni CFDI de recuperación.

Frase sugerida: «Autorizo la ventana `fx6-prod-AAAAMMDDTHHMMZ` (hora UTC de inicio) con los tres puntos del RUNBOOK».

## Antes de la ventana (tú)

- Elegir un horario de poca facturación (por ejemplo, después de las 20:00 hora de la Ciudad de México).
- Tener en ELOGISTIX un cliente receptor **ficticio** (no un cliente real) con datos fiscales válidos para sandbox y claves SAT válidas, y un concepto de $100 + IVA ($116), cantidad 1.
- Confirmar que GitHub Actions pasó en el commit que contiene este kit.

## Durante la ventana

| Paso | Quién | Acción | Si falla |
|---|---|---|---|
| A0 | Agente | `python3 qa/facturapi6-phase4/activation.py check` debe decir `estado=base`; `build_manifest.py --check` vigente | Detener sin cambios. Si alguien cambió esos archivos después del kit, se rehace el kit y se revisa; nunca se fuerza |
| A1 | Agente (lectura) | `sql/cron_status.sql`: 2 jobs activos y 0 corridas en curso | Esperar 5 min o detener sin cambios |
| A2 | Agente | `sql/cron_pause.sql` | Detener sin cambios |
| A3 | Agente | `activation.py apply --run-id <run-id>` y desplegar las 12 funciones de `MANIFEST.json → deploy_functions` con la herramienta oficial | Reversa R |
| A4 | Agente (lectura) | Logs de arranque de las 12 funciones sin errores de import | Reversa R |
| A5 | Tú | En ELOGISTIX, desde las pantallas normales: Factura A, Factura B, REP de A, NC de A, cancelar B, refrescar estado de B, descargar PDF/XML de los cuatro. **Sin reintentos**: si algo falla, detente y avisa | Reversa R si la causa es el SDK |
| A6 | Agente (lectura) | `sql/verify_elogistix.sql` con la hora de inicio; logs de las funciones | Reversa R si hay diferencias |
| A7 | Agente | `sql/cron_resume.sql` (**siempre**, también después de una reversa) | Revisar a mano de inmediato |
| A8 | Agente (lectura) | Primera corrida de cada tarea automática con 6.0.0 sin errores | Reversa R |

Resultado esperado en A6: modo `test`; dos facturas con UUID, PDF y XML; B con el estado real que devuelva el refresco (una cancelación pendiente se registra como pendiente, no como éxito); REP con parcialidad 1, saldo anterior $116 e insoluto $58; NC por $58 ligada sólo a A, con UUID, PDF y XML; sin filas nuevas inesperadas en la cola de reintentos. No se cancelan el REP ni la NC.

## Reversa R

1. `python3 qa/facturapi6-phase4/activation.py rollback --run-id <run-id>` → `estado=base`. Nunca la bloquea el horario.
2. Desplegar de nuevo las mismas 12 funciones.
3. `sql/cron_resume.sql`.
4. Revisar logs de arranque y registrar el motivo en `README.md`.

Los CFDI de prueba ya emitidos en modo test no se borran: no tienen validez fiscal y se quedan como evidencia.

Criterios de reversa: error de arranque o import; algún documento de prueba falla por el SDK y no por los datos capturados; fechas guardadas con desfase; fallan PDF/XML; errores nuevos de otras empresas en logs o Sentry durante la ventana.

## Después

- Vigilar 24 horas Sentry, la cola de reintentos y la reconciliación.
- Fase 5, tras 2 semanas estables: retirar el alias npm `facturapi6-preview`, la pantalla QA de preflight, este kit y las copias QA; desactivar la función booleana con su recuperación sin DROP ya preparada.

## Límites

- La ventana es la primera prueba en el runtime Deno desplegado y contra el sandbox real de Facturapi/SAT. Las pruebas offline no lo sustituyen.
- Desde A3, las empresas en modo live también timbran con 6.0.0 (activación «todo de una vez»).
- Una operación ya enviada al proveedor no se puede retirar; por eso no hay reintentos manuales durante la ventana.
