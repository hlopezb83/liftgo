
## Objetivo

Evitar doble conteo en `get_income_statement` cuando una misma partida se capturó en `supplier_bills` y en `operating_expenses`. El "matching" será por **fecha + monto + descripción normalizada**.

## Cambios

### 1. Migración: reemplazar `expense_lines` en `get_income_statement`

Reglas de deduplicación (aplicadas dentro del CTE `expense_lines`):

- **Fuente prioritaria:** `supplier_bills`. Cuando un `operating_expenses` coincide con un `supplier_bill`, se descarta la fila de `operating_expenses`.
- **Llave de match:**
  - `date_key`: en base `accrual` = `sb.issue_date` / `oe.expense_date`; en base `cash` = `sp.payment_date` / `oe.expense_date`.
  - `amount_key`: `ROUND(monto, 2)` (para tolerar diferencias de centavos por proration en cash).
  - `desc_key`: `lower(regexp_replace(trim(coalesce(description,'')), '\s+', ' ', 'g'))` — normaliza espacios múltiples y mayúsculas.
- El match se hace **por combinación exacta de las tres llaves**; nada de LIKE ni fuzzy — evita colapsar partidas legítimamente iguales de meses distintos.
- Se conserva la categoría de la fuente ganadora (`supplier_bills`).

Estructura:

```text
sb_lines  = filas de supplier_bills (como hoy, con category, month_key, amount)
oe_lines  = filas de operating_expenses (como hoy)
dup_keys  = SELECT (date_key, amount_key, desc_key) FROM sb_lines
oe_dedup  = oe_lines LEFT JOIN dup_keys ... WHERE dup_keys.date_key IS NULL
expense_lines = sb_lines UNION ALL oe_dedup
```

El resto del RPC (agrupaciones, `expenses_by_month`, etc.) no cambia.

### 2. Tests

Agregar test SQL/Vitest (según patrón existente) que:
- Inserta un `supplier_bill` y un `operating_expense` con misma fecha/monto/descripción → `expenses.otro` cuenta 1 vez.
- Inserta partidas distintas con misma descripción pero diferente fecha → cuentan las dos.
- Base `cash`: paga el `supplier_bill` en un mes y verifica que sigue deduplicando contra `operating_expenses` de esa fecha.

### 3. Changelog

Entrada patch (v7.108.2 o siguiente) describiendo la deduplicación y su impacto en el Estado de Resultados histórico.

## Fuera de alcance

- **No** se borran filas duplicadas de `operating_expenses` — sólo se ignoran en el reporte. Si más adelante quieres limpieza permanente, se hace en un sprint aparte con confirmación explícita por partida.
- **No** se cambia el flujo de captura (frontend) — sigue permitiendo ambos orígenes.
- **No** se toca `get_dashboard_stats` ni otros RPCs de reporte; si comparten el mismo problema, se atiende después.

## Riesgos

- Si dos partidas legítimamente distintas tienen misma fecha + monto + descripción idéntica (poco probable dado que las descripciones incluyen folios), una se colapsará. Mitigación: los tests cubren el caso de fechas distintas; en producción los folios en la descripción hacen que el colisión sea extremadamente rara.

## Detalle técnico (SQL clave)

```sql
WITH sb_lines AS (
  SELECT
    CASE WHEN p_basis='cash' THEN to_char(date_trunc('month', sp.payment_date),'YYYY-MM')
         ELSE to_char(date_trunc('month', sb.issue_date),'YYYY-MM') END AS month_key,
    CASE WHEN p_basis='cash' THEN sp.payment_date ELSE sb.issue_date END AS date_key,
    sb.category::text AS category,
    sb.description,
    CASE WHEN p_basis='cash' THEN
      CASE WHEN COALESCE(sb.total,0)>0 THEN sb.subtotal*(sp.amount/sb.total) ELSE sp.amount END
    ELSE sb.subtotal END AS amount
  FROM supplier_bills sb
  LEFT JOIN supplier_payments sp
    ON p_basis='cash' AND sp.bill_id=sb.id
    AND sp.payment_date BETWEEN p_start_date AND p_end_date
  WHERE sb.status<>'cancelled'
    AND sb.category IS NOT NULL
    AND sb.category NOT IN ('software','depreciacion')
    AND CASE WHEN p_basis='cash' THEN sp.id IS NOT NULL
             ELSE sb.issue_date BETWEEN p_start_date AND p_end_date END
),
oe_lines AS (
  SELECT
    to_char(date_trunc('month', oe.expense_date),'YYYY-MM') AS month_key,
    oe.expense_date AS date_key,
    oe.category::text AS category,
    oe.description,
    oe.amount
  FROM operating_expenses oe
  WHERE oe.category IS NOT NULL
    AND oe.category NOT IN ('software','depreciacion')
    AND oe.expense_date BETWEEN p_start_date AND p_end_date
),
dup_keys AS (
  SELECT DISTINCT
    date_key,
    ROUND(amount::numeric, 2) AS amount_key,
    lower(regexp_replace(trim(coalesce(description,'')), '\s+', ' ', 'g')) AS desc_key
  FROM sb_lines
),
oe_dedup AS (
  SELECT oe.month_key, oe.category, oe.amount
  FROM oe_lines oe
  LEFT JOIN dup_keys d
    ON d.date_key = oe.date_key
   AND d.amount_key = ROUND(oe.amount::numeric, 2)
   AND d.desc_key = lower(regexp_replace(trim(coalesce(oe.description,'')), '\s+', ' ', 'g'))
  WHERE d.date_key IS NULL
),
expense_lines AS (
  SELECT month_key, category, amount FROM sb_lines
  UNION ALL
  SELECT month_key, category, amount FROM oe_dedup
)
```

## Verificación

Post-migración, correr en el chat:

```sql
SELECT (get_income_statement('2026-01-01','2026-12-31','accrual')->'months')
```

y confirmar que la categoría `otro` YTD baja de ~$1.67M a ~$878k (equivalente al total de `supplier_bills` con extras únicos de `operating_expenses`).
