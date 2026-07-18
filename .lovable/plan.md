## Problema

Usuario `administrativo` (`admin@lopezbenavides.com`) recibe en `/` (dashboard) un `permission denied for view v_invoices_with_balance` (SQLSTATE 42501, requestId `23e760dc…`). Todas las llamadas al dashboard pasan por RPCs `SECURITY DEFINER` que sí funcionan en teoría (`get_dashboard_stats`, `get_financial_kpis`, `list_invoices_with_balance`), y no queda código cliente que consulte la vista directamente. La causa es que `list_invoices_with_balance` retorna `SETOF v_invoices_with_balance`: PostgREST valida los privilegios del rol invocador (`authenticated`) sobre el tipo de retorno al mapear las filas de vuelta al cliente, aunque la función sea `SECURITY DEFINER`. En Sprint 1 (SEC-005) revoqué `SELECT` sobre la vista, así que la RPC devuelve filas pero PostgREST rechaza la respuesta.

## Fix

Reponer `GRANT SELECT ON public.v_invoices_with_balance TO authenticated`. No reintroduce SEC-005 porque:

- La vista está creada con `security_invoker = on`; toda consulta directa aplica la RLS de `invoices` y `payments` sobre el `auth.uid()` real. Es decir: aunque un `customer` la consultara directo, solo vería sus propias facturas.
- Ningún hook del cliente hace `from("v_invoices_with_balance")`. Verificado con `rg`. Todo el consumo pasa por la RPC filtrada por rol.
- La superficie real que SEC-005 quería cerrar (customer viendo facturas de otros) ya está cubierta por RLS de las tablas base.

## Cambios

1. Migración: `GRANT SELECT ON public.v_invoices_with_balance TO authenticated;`
2. `public/changelog.json` + `public/changelog/v7.77.2.json` (patch).

## Verificación

- `has_table_privilege('authenticated', 'public.v_invoices_with_balance', 'SELECT')` → `t`.
- Revisar dashboard como `administrativo`: `useUpcomingInvoices` deja de fallar.
- Reporte de bug con requestId `23e760dc…` debería dejar de reproducirse.

## Riesgos

- Que un cliente futuro consulte la vista directo saltándose la RPC. Mitigación: la RLS de la vista (security_invoker) sigue vigente; a lo más, un `customer` podría leer sus propias facturas — no más de lo que ya autoriza la RLS de `invoices`.
