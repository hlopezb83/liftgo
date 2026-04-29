## Problema

El módulo **Estado de Resultados** falla con error 400:
```
column "expense_date" does not exist
```

El RPC `get_income_statement` no devuelve datos, por eso no se ven los meses en la pantalla.

## Causa raíz

Bug en el CTE `expenses_by_month` dentro del RPC. El subquery interno agrupa por mes y devuelve solo `month_key, category, total`, pero el `SELECT` externo intenta volver a calcular `to_char(date_trunc('month', expense_date), ...)` referenciando `expense_date` — una columna que ya no existe en el resultado del subquery.

```sql
-- Actualmente (roto):
expenses_by_month AS (
  SELECT
    to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month_key,  -- ❌ expense_date no existe aquí
    jsonb_object_agg(category::text, total) AS expenses
  FROM (
    SELECT
      to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month_key,
      category,
      SUM(amount) AS total
    FROM operating_expenses
    WHERE expense_date BETWEEN p_start_date AND p_end_date
    GROUP BY 1, 2
  ) t
  GROUP BY month_key
)
```

## Fix

Migración que reemplaza `get_income_statement` cambiando el SELECT externo del CTE para usar el `month_key` ya calculado por el subquery:

```sql
expenses_by_month AS (
  SELECT
    month_key,
    jsonb_object_agg(category::text, total) AS expenses
  FROM (
    SELECT
      to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month_key,
      category,
      SUM(amount) AS total
    FROM operating_expenses
    WHERE expense_date BETWEEN p_start_date AND p_end_date
    GROUP BY 1, 2
  ) t
  GROUP BY month_key
)
```

El resto del RPC se mantiene idéntico (autorización, basis devengado/flujo, depreciación, clientes, etc.).

## Pasos

1. Crear migración SQL que `CREATE OR REPLACE` la función `get_income_statement` con la corrección del CTE.
2. Verificar en `/income-statement` que ahora se cargan los meses correctamente.
3. Agregar entrada al changelog (patch): "Corrección Estado de Resultados — RPC fallaba por referencia a columna inexistente en CTE de gastos."
