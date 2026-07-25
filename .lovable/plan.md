## Diagnóstico

En el Panel existe la tarjeta **"Rentas Vencidas"** (`AlertsRow.tsx`) que muestra reservas confirmadas cuyo `end_date` ya pasó y siguen sin devolverse. Se alimenta de `stats.overdue_bookings` desde la RPC `get_dashboard_stats`.

Al inspeccionar la RPC actual en BD, la clave `overdue_bookings` **ya no se emite** en el JSON de respuesta (se perdió en algún refactor reciente del RPC). Por eso el frontend recibe `[]`, la card se oculta y "desaparece" del Panel.

Verificado en datos: hay 3 reservas confirmadas con `end_date < hoy` y forklift en `rented` — deberían mostrarse:
- MCLTC035A048/009 (vence 24/06/2026)
- MCGSC030A048/015 (vence 06/07/2026)
- MCGSC030A048/016 (vence 08/07/2026)

## Plan (v7.227.2)

1. **Migración SQL**: reescribir `public.get_dashboard_stats()` para incluir de vuelta la sección `overdue_bookings` en el JSON:
   ```sql
   'overdue_bookings', COALESCE((
     SELECT jsonb_agg(row_to_json(x) ORDER BY x.end_date)
     FROM (
       SELECT b.id AS booking_id,
              f.name AS forklift_name,
              f.id   AS forklift_id,
              c.name AS customer_name,
              b.end_date,
              (CURRENT_DATE - b.end_date)::int AS days_overdue
       FROM public.bookings b
       JOIN public.forklifts f ON f.id = b.forklift_id
       LEFT JOIN public.customers c ON c.id = b.customer_id
       WHERE b.status = 'confirmed'
         AND b.end_date < CURRENT_DATE
     ) x
   ), '[]'::jsonb)
   ```
   Mantener `SECURITY DEFINER` + `SET search_path = public` y el resto del payload intacto.

2. **Sin cambios de frontend**: `AlertsRow` y `dashboardSectionHelpers.ts` ya consumen `overdue_bookings` con el shape correcto — solo faltaba que el backend lo emitiera.

3. **Changelog**: `public/changelog.json` + `public/changelog/v7.227.2.json` describiendo la restauración de la alerta "Rentas Vencidas" (patch).

4. **Validación**: tras aplicar la migración, verificar en `/` que la card "Rentas Vencidas" aparezca con las 3 reservas identificadas.

## Fuera de alcance
No se toca el KPI de "Rentados" del calendario (v7.227.1) ni la lógica de status de forklifts.