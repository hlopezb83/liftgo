# Arreglar los E2E rotos por la máquina de estados (ronda 2)

## Qué está pasando

Los 13 tests que fallan en el shard 1/2 tienen todos el mismo origen, un único error repetido 52 veces:

```text
e2e_seed_scenario failed: Estado inicial no permitido en quotes: accepted.
Usa el flujo/RPC correspondiente.
```

En la ronda de auditoría 2 se agregó el disparador `validate_transition`, que exige que toda cotización nazca en `draft` o `sent` y sólo llegue a `accepted` mediante una transición válida. La función de siembra de pruebas `e2e_seed_scenario` sigue insertando la cotización directamente como `accepted`, así que la siembra revienta y con ella todas las pruebas que dependen de ella (facturación, fiscal, pagos, devoluciones, kanban de mantenimiento, PDF de cotización, cotización→reserva, flujo completo).

No es un bug de la aplicación: la regla nueva es correcta y la siembra es la que quedó desalineada.

## Qué se va a cambiar

Una sola migración que actualiza `e2e_seed_scenario` para que la cotización sembrada recorra el camino legal en vez de saltárselo:

1. Insertar la cotización con estado `draft` (estado inicial permitido).
2. Inmediatamente después, actualizarla a `accepted` con `accepted_at = now()`, transición que la máquina de estados sí permite (`draft → accepted`).

El resto de la siembra ya cumple las reglas nuevas (montacargas `available`, reserva `confirmed`, facturas `sent`), así que no se toca.

## Verificación

- Ejecutar `e2e_seed_scenario` con un scope temporal y confirmar que devuelve la cotización en `accepted`, seguido del teardown correspondiente.
- Correr localmente los specs afectados (`booking-to-invoice`, `full-flow`, `quote-to-booking`, `fiscal-*`, `invoice-payment`, `return-inspection`, `maintenance-kanban`, `quote-pdf`).

## Notas técnicas

- Objeto tocado: `public.e2e_seed_scenario(p_scope text)` (SECURITY DEFINER), sin cambios de esquema ni de permisos.
- No se relaja `validate_transition`: la regla de negocio se mantiene intacta; se corrige la siembra.
- Al cierre se agrega la entrada de changelog (parche) en `public/changelog.json` y `public/changelog/v7.260.1.json`, y se alinea `package.json`/`version.json`.
