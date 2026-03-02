

## Quitar la tarjeta "Modelo de Equipo" del detalle de cotizacion

### Cambio

Eliminar el bloque condicional en `src/pages/QuoteDetail.tsx` (lineas 126-134) que renderiza la tarjeta "Modelo de Equipo" cuando la cotizacion es de tipo venta. Esta informacion ya aparece dentro de la tabla de partidas (line items), por lo que la tarjeta separada es redundante.

### Detalle tecnico

- 1 archivo modificado: `src/pages/QuoteDetail.tsx`
- Se elimina el bloque `{isSale && (quote as any).equipment_model_id && ...}` que genera la `<Card>` con titulo "Modelo de Equipo"
- No afecta ninguna otra funcionalidad; los modelos siguen visibles en las partidas de la cotizacion

