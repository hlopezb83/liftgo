# Tablero: montacargas "disponibles" que en realidad están rentados

## Qué está pasando

Hoy el tablero cuenta 47 disponibles y 5 rentados. Revisé los datos reales:

- 21 montacargas tienen una renta vigente hoy (fecha de inicio ya pasó, fecha fin todavía no llega) y aun así figuran como "disponibles".
- El motivo: la entrega de esas rentas quedó en estado "programada" y nunca se marcó como completada. Cerrar la entrega es el único evento que pasa la unidad a "rentado". De 32 entregas registradas, sólo 7 están completadas.
- Algunas de esas rentas empezaron hace meses (por ejemplo, reservas de diciembre 2025, marzo y abril 2026), así que no es un caso aislado sino un hábito de captura.

Es como un hotel donde el huésped ya está durmiendo en el cuarto, pero recepción nunca marcó el check-in: el sistema sigue vendiendo el cuarto como libre.

## Qué voy a hacer (las dos cosas que aprobaste)

### 1. Tablero más honesto

- El conteo de la flota dejará de mirar sólo el estado guardado de la unidad y considerará también las rentas vigentes al día de hoy. Una unidad con renta en curso se cuenta como rentada aunque su entrega siga abierta.
- La utilización y la gráfica de la flota usarán ese mismo criterio, para que todo el tablero cuente igual.
- Se agrega un aviso en el tablero: "N entregas pendientes de cerrar", con enlace a la lista de entregas programadas, para que el equipo las cierre y el dato no se vuelva a desviar.

### 2. Corregir los datos existentes

- Las 21 unidades con renta vigente quedarán marcadas como rentadas, dejando registro en la bitácora de estatus con el motivo (regularización por entrega no cerrada).
- Importante: las entregas en sí sólo se pueden cerrar con evidencia (operador, firma o justificación escrita), así que **no** las cerraré automáticamente. Quedan en la lista de pendientes del aviso para que quien corresponda las cierre con su justificación.
- Esta parte escribe en la base de producción; la ejecuto en un solo paso reversible y te confirmo el resultado con el antes/después.

## Detalle técnico

- `get_dashboard_stats`: `fleet_counts` pasa a derivar `rented`/`available` combinando `forklifts.status` con la existencia de una reserva `confirmed` cuyo rango cubre `today_mty()`; se añade `pending_deliveries` (entregas `scheduled` de reservas vigentes) al JSON.
- `computeFleetAvailability` y `dashboardSectionHelpers` consumen los nuevos conteos sin duplicar lógica; `CalendarStatCards` hereda el cambio.
- Backfill de datos: `UPDATE forklifts SET status='rented'` sólo para los IDs con reserva vigente y estado `available`, vía la función de cambio de estatus existente para que quede en `status_logs`. Sin tocar RLS, permisos ni máquinas de estado.
- Pruebas focalizadas nuevas para el conteo con reserva vigente; typecheck, ESLint y build. Suite completa y cobertura quedan en GitHub Actions.
- Changelog: entrada minor (8.7.0).
