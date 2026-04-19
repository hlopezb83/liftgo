
## Objetivo
Limitar el campo "Utilización" del Resumen Financiero del montacargas a un máximo de 100%, ya que `days_since_acquired` usa `created_at` del sistema (no la fecha real de compra), lo que infla artificialmente el porcentaje en equipos cargados tarde al ERP.

## Cambio
Migración SQL que actualiza la RPC `get_forklift_financials` para envolver el cálculo de `utilization_percent` con `LEAST(100, ...)`.

```sql
-- Antes:
ROUND((days_rented::numeric / NULLIF(days_since_acquired, 0)) * 100, 1)

-- Después:
LEAST(100, ROUND((days_rented::numeric / NULLIF(days_since_acquired, 0)) * 100, 1))
```

Sin cambios en frontend — el componente `ForkliftFinancialCard` ya muestra el valor tal cual lo entrega el RPC.

## Changelog
**v5.31.4 (patch)** — "Fix: Topar utilización por unidad en 100% para evitar distorsión por carga tardía al ERP"

## Archivos
- Nueva migración SQL recreando `get_forklift_financials` con el `LEAST(100, ...)`
- `public/changelog.json` con entrada v5.31.4
