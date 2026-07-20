## Problema

El hook `useInvoicesWithBalance` (fuente única de verdad para "facturas + saldo", consumida por el Dashboard, Pronóstico de Cobranza, Aging, MRR, etc.) llama al RPC `public.list_invoices_with_balance(p_statuses, p_due_from, p_due_to, p_with_balance_only, p_limit, p_offset)`.

Ese RPC **no existe** en la base de datos (`pg_proc` no lo tiene). La vista `v_invoices_with_balance` sí existe y tiene todas las columnas necesarias. En algún sprint previo se refactorizó el hook para consumir el RPC (comentario SEC-005 + PERF-001) pero la migración que crea el RPC nunca se aplicó.

Resultado: PostgREST devuelve `PGRST202 – Could not find the function`, y el Dashboard revienta al cargar.

## Solución

Crear el RPC faltante `list_invoices_with_balance` con la firma exacta que el hook ya está usando, `SECURITY DEFINER` y filtrado por rol equivalente a las policies existentes de `invoices`.

### Migración

`supabase/migrations/<ts>_create_list_invoices_with_balance.sql`:

- `CREATE OR REPLACE FUNCTION public.list_invoices_with_balance(p_statuses text[], p_due_from date, p_due_to date, p_with_balance_only boolean, p_limit int, p_offset int) RETURNS SETOF public.v_invoices_with_balance`
- `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`
- Cuerpo: `SELECT ... FROM v_invoices_with_balance WHERE`
  - `status = ANY(p_statuses)` cuando `p_statuses` no es null
  - `due_date BETWEEN p_due_from AND p_due_to` cuando aplique
  - `balance > 0` cuando `p_with_balance_only`
  - Filtrado por rol: si el usuario es `customer`, restringir a sus propias facturas (via `has_role` + `customer_id = auth.uid()` resolución equivalente a las policies actuales de `invoices`); admin/administrativo/ventas/etc. ven todo.
  - `ORDER BY due_date NULLS LAST, issued_at DESC`
  - `LIMIT COALESCE(p_limit, 1000) OFFSET COALESCE(p_offset, 0)`
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE TO authenticated;`

### Changelog

Nueva entrada `v7.112.1` (patch) explicando la restauración del RPC faltante que rompía el Dashboard.

## Fuera de alcance

- No se toca el frontend (el hook ya tiene la firma correcta).
- No se modifica `v_invoices_with_balance`.
- No se cambia la lógica de otras pantallas.
