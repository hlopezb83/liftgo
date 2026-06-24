## Diagnóstico: por qué no aparece el COGS del equipo vendido en mayo

Investigué la base de datos. El equipo vendido en mayo es **MCLTC025A048/010**, vendido el 29/05/2026, pero **tiene `acquisition_cost = 0`**. El RPC excluye explícitamente los equipos sin costo de adquisición del cálculo de COGS, por eso no aparece la línea.

Además detecté **4 equipos más marcados como `sold`** que tampoco aparecen porque **no tienen entrada en `status_logs`** con `to_status='sold'` (MCDLC50A048/001, MCAPC035A048/002 y /004, MCLTC025A048/007). El RPC depende de ese log para saber la fecha de venta, así que silenciosamente los ignora.

## Causa raíz

1. **Costo de adquisición en 0** → el equipo no entra al CTE `sold_forklifts` (filtra `acquisition_cost > 0`).
2. **Falta de `status_logs`** → algunos equipos fueron marcados como vendidos sin pasar por el flujo que escribe el log, así que `sold_at` es `NULL` y se ignoran.

## Plan de corrección

### 1. RPC `get_income_statement` (migración SQL)

- **Fallback de fecha de venta**: cuando no exista `status_logs` con `to_status='sold'`, usar `forklifts.updated_at` como `sold_at`. Así los equipos manualmente marcados como vendidos también entran al COGS.
- **Nueva lista de advertencia `sold_without_cost`**: equipos con `status='sold'` y `acquisition_cost IS NULL OR ≤ 0`, devuelta en el JSON junto a `rented_without_cost`.

### 2. Frontend

- **`useMonthlyData.ts`** y **`useIncomeStatementData.ts`**: leer y propagar `sold_without_cost` / `soldWithoutCost`.
- **`IncomeStatementReport.tsx`**: agregar una segunda alerta amarilla (debajo de la existente) con el texto:
  > "Los siguientes equipos están marcados como vendidos pero no tienen costo de adquisición registrado, por lo que no aparecen en el Costo de Equipos Vendidos: **\<lista\>**. Actualiza el costo en la ficha del equipo."

### 3. Changelog `v6.91.2` (patch)

- Entrada en `public/changelog.json` + detalle en `public/changelog/v6.91.2.json`.

## Fuera de alcance

- No se modifica el costo de adquisición de ningún equipo automáticamente — eso lo hace el usuario en la ficha del montacargas.
- No se cambia el flujo que marca un equipo como vendido (sigue siendo responsabilidad del usuario asegurar que se registre vía el flujo correcto).

## Acción inmediata sugerida para el usuario

Una vez aplicado el fix, para que aparezca el COGS de **MCLTC025A048/010** en mayo, hay que **registrar su costo de adquisición real** en la ficha del montacargas.