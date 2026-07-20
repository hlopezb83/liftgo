
## Estado actual

Esto ya quedó implementado en la migración anterior (**v7.108.2**). El CTE `expense_lines` de `get_income_statement` hoy funciona así:

1. `sb_lines` — todas las partidas de `supplier_bills` no canceladas (fuente formal).
2. `oe_lines` — todas las partidas de `operating_expenses`.
3. `dup_keys` — deriva `(date_key, amount_key, desc_key)` desde `sb_lines`.
4. `oe_dedup` — `oe_lines LEFT JOIN dup_keys ... WHERE dup_keys.date_key IS NULL` → excluye cualquier `operating_expenses` que coincida con un `supplier_bills`.
5. `expense_lines = sb_lines UNION ALL oe_dedup`.

Verificado: "Otro" YTD 2026 pasó de $1,665,627 → $878,845 y los 48 `operating_expenses` de esa categoría fueron descartados por matchear 1-a-1 con su factura de proveedor.

## Opciones

Puedo:

- **A. Cerrar el pedido.** El comportamiento pedido ya está activo. Confirmo con una consulta más (todas las categorías, no sólo "Otro") y no toco código.
- **B. Endurecer la regla.** Hoy el match exige fecha + monto + descripción idénticos. Si quieres que sea aún más agresivo (por ejemplo: mismo proveedor + mismo mes + mismo monto, ignorando descripción), lo cambio — pero puede colapsar partidas legítimamente distintas. Necesito confirmación antes.
- **C. Migración a fuente única en captura.** Impedir que se sigan creando `operating_expenses` que dupliquen una `supplier_bills` — esto sí es cambio nuevo (validación en frontend/trigger). Es un sprint aparte.

## Pregunta

¿Cuál de las tres quieres? Mi recomendación es **A** (verificar y cerrar) porque la migración anterior ya cubre el caso que describiste; **C** vale la pena si quieres eliminar el problema de raíz en la captura, pero implica cambios de UI y validación.
