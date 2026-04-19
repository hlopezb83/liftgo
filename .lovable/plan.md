

## Diagnóstico

La función `get_financial_kpis` falla en el cálculo de DSO. La línea:
```sql
EXTRACT(EPOCH FROM (i.paid_at - i.issued_at)) / 86400.0
```
falla porque `paid_at` y/o `issued_at` son tipo `date`, y `date - date` retorna `integer` (días), no `interval`. `EXTRACT(EPOCH FROM integer)` no existe → error 404 en el RPC → tres KPIs rotos en el panel.

## Fix

Migración SQL que reemplaza la función `get_financial_kpis` con el cálculo de DSO corregido:

```sql
-- Reemplazar las dos consultas de DSO usando resta directa de dates
v_dso := AVG(i.paid_at - i.issued_at)  -- ya está en días
```

Cambios puntuales dentro de la función (sin tocar el resto):
- DSO actual: `AVG((i.paid_at - i.issued_at))` con cast a numeric
- DSO mes anterior: misma simplificación
- Dejar intacto MRR, cartera vencida y contratos por vencer

Versión changelog: **v5.31.2 (patch)** — "Fix: KPIs financieros del panel (MRR, DSO, Cartera Vencida)"

## Archivos
- Nueva migración SQL para recrear `get_financial_kpis`
- `public/changelog.json` con entrada v5.31.2

