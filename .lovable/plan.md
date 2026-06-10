Verifiqué visualmente `/activity` y sí aparece `e2e-admin@liftgo.test` en el dashboard:

- KPIs muestran `543` acciones en 7 días.
- Lista de miembros muestra `e2e-admin@liftgo.test`.
- La línea de tiempo ya se ve limpia: las filas visibles son de Sonia Hernandez y la petición trae `is_e2e=false`.

También confirmé en base de datos que en los últimos 7 días hay:

- `530` movimientos E2E marcados como `is_e2e=true`.
- `13` movimientos reales marcados como `is_e2e=false`.

## Causa

El filtro E2E ya está aplicado en `useActivityFeed`, por eso la línea de tiempo está limpia. El problema está en el dashboard superior de Actividad del Equipo: `activityMetricsCalculators.ts` calcula KPIs, usuarios, módulos y horas desde `activity_feed` sin filtrar `is_e2e`, entonces suma los 530 registros de tests.

## Plan de implementación

1. Actualizar `src/features/audit/lib/activityMetricsCalculators.ts`
   - Agregar el filtro `is_e2e IS NULL OR is_e2e = false` a la consulta principal de métricas.
   - Agregar el mismo filtro al conteo del periodo anterior.
   - Mantener los cálculos existentes de miembros, módulos y hora pico, pero ya sólo con actividad real.

2. Verificar visualmente `/activity`
   - Confirmar que desaparece `e2e-admin@liftgo.test` de miembros.
   - Confirmar que el KPI de 7 días baja de `543` a `13` aproximadamente, según la data actual.
   - Confirmar que la línea de tiempo sigue limpia.

3. Actualizar changelog
   - Crear `public/changelog/v6.42.3.json` como patch.
   - Agregar la entrada al inicio de `public/changelog.json`.