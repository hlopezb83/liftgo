

## Fix: Costo de Venta no se refleja en Estado de Resultados

### Problema
Hay 5 montacargas vendidos con costos de adquisición registrados, pero la tabla `operating_expenses` está completamente vacía. Los registros de "Costo de Venta" nunca se crearon — probablemente porque los equipos se vendieron antes de que existiera el código de auto-inserción, o porque el insert falló silenciosamente (no hay manejo de errores en esa línea).

### Solución (2 partes)

**1. Migración: Insertar los registros faltantes de costo de venta**

Ejecutar una migración SQL que genere registros `costo_venta` en `operating_expenses` para cada montacargas con `status = 'sold'` y `acquisition_cost > 0` que no tenga ya un registro correspondiente. Se usará la fecha del último `status_log` donde `to_status = 'sold'` como `expense_date`.

```sql
INSERT INTO operating_expenses (category, description, amount, expense_date, is_recurring)
SELECT 
  'costo_venta',
  'Costo de venta: ' || f.name,
  f.acquisition_cost,
  COALESCE(
    (SELECT MAX(sl.created_at::date) FROM status_logs sl 
     WHERE sl.forklift_id = f.id AND sl.to_status = 'sold'),
    CURRENT_DATE
  ),
  false
FROM forklifts f
WHERE f.status = 'sold' AND f.acquisition_cost > 0
AND NOT EXISTS (
  SELECT 1 FROM operating_expenses oe 
  WHERE oe.category = 'costo_venta' 
  AND oe.description LIKE '%' || f.name || '%'
);
```

**2. Código: Agregar manejo de errores al auto-insert**

En `src/hooks/useForklifts.ts`, agregar manejo de errores cuando se inserta el gasto automático al vender, para que no falle silenciosamente. Mostrar un toast de advertencia si falla la inserción del costo de venta.

### Archivos a modificar
- **Migración SQL** — insertar registros faltantes
- `src/hooks/useForklifts.ts` — agregar error handling al insert de costo_venta
- `src/lib/changelog.ts` — registrar el fix

