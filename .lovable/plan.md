## Ajustar depreciación a 25% anual (48 meses)

La Ley del ISR de México establece **25% anual** de depreciación para equipo de renta. Hoy el sistema usa **36 meses (≈33% anual)**. Ajustar a **48 meses** afecta dos líneas del Estado de Resultados:

1. **Depreciación mensual por reserva activa** — actualmente `acquisition_cost / 36`.
2. **Costo de Equipos Vendidos (COGS)** — fórmula del valor en libros al vender.

### Nueva fórmula

```text
depreciacion_mensual   = acquisition_cost / 48
months_rented          = meses con reserva confirmada/completada antes de la venta (cap 48)
depreciacion_acumulada = acquisition_cost × min(48, months_rented) / 48
valor_en_libros        = max(0, acquisition_cost − depreciacion_acumulada)
```

### Cambios técnicos

1. **Migración SQL** — actualizar `get_income_statement`:
   - CTE de depreciación: `/ 36.0` → `/ 48.0` (2 ocurrencias).
   - CTE `cogs_per_sold`: `LEAST(36, ...) / 36.0` → `LEAST(48, ...) / 48.0`.
   - Sin cambios de firma; `SECURITY DEFINER`, `SET search_path = public`.
2. **Changelog v6.91.1** (patch — ajuste de regla contable a normativa fiscal mexicana): entrada en `public/changelog.json` + detalle en `public/changelog/v6.91.1.json`.

### Efecto en el reporte

- **Gasto mensual de depreciación baja ~25%** (de 1/36 a 1/48 por unidad activa).
- **COGS al vender sube** (valor en libros remanente mayor porque se depreció menos), reflejando mejor la utilidad real de la venta.
- Aplica retroactivo a todo el histórico al refrescar (cálculo derivado, sin backfill).

### Fuera de alcance

- No se cambia el cap de meses en otras vistas que no usen este RPC.
- No se toca el manejo manual de `costo_venta` en facturas de proveedor.