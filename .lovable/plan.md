

# Descuento por línea (% o monto fijo) en cotizaciones

## Resumen
Cada línea de la cotización tendrá un campo de descuento con un selector de tipo: porcentaje (%) o monto fijo ($). El descuento se aplica al total de esa línea y se refleja en formulario, vista de detalle y PDF.

## Modelo de datos

En `LineItem` (src/lib/invoiceUtils.ts) agregar dos campos opcionales:
```typescript
discount?: number;          // valor del descuento
discount_type?: "%" | "$";  // tipo (default "%")
```
No requiere migración DB — `line_items` es JSONB.

## Cálculo del descuento

- Si `discount_type === "%"`: `totalNeto = total * (1 - discount/100)`
- Si `discount_type === "$"`: `totalNeto = total - discount`
- Se clampa a 0 mínimo

Agregar función helper `applyDiscount(item: LineItem): number` en `invoiceUtils.ts`.

## Cambios por archivo

### `src/lib/invoiceUtils.ts`
- Agregar `discount?` y `discount_type?` a `LineItem`
- Agregar `applyDiscount()` helper
- Modificar `computeTotals` para usar `applyDiscount` en vez de `item.total`

### `src/lib/pdfHelpers.ts`
- Agregar `discount?` y `discount_type?` a `PdfLineItem`

### `src/pages/QuoteForm.tsx`
- Agregar estado `discounts: Record<number, { value: number; type: "%" | "$" }>` para las líneas de renta
- Antes de guardar, inyectar `discount` y `discount_type` en cada `LineItem`
- Mostrar por cada línea de renta un mini-grupo: input numérico + toggle/select de tipo (% / $)

### `src/components/SaleLineItems.tsx`
- Agregar `discount` y `discountType` al tipo `SaleLine`
- Agregar input de descuento + selector de tipo por línea
- Ajustar el total mostrado usando `applyDiscount`

### `src/components/CostSummaryCard.tsx`
- Mostrar total con descuento aplicado por línea
- Si hay descuento, mostrar indicador (ej. "(-10%)" o "(-$500)") junto al total

### `src/components/ReadOnlyLineItemsTable.tsx`
- Agregar columna "Dto." condicional (solo si alguna línea tiene descuento)
- Mostrar "10%" o "$500" según tipo
- El total ya viene neto

### `src/lib/quotePdfPremium.ts`
- Agregar columna "DTO." en la tabla cuando haya descuentos
- Ajustar posiciones de columnas dinámicamente
- Mostrar el porcentaje o monto de descuento por línea

### `src/lib/changelog.ts`
- Registrar en v3.29.0

## Flujo del usuario
1. En el formulario de cotización, cada línea muestra un campo "Dto." con un selector "% | $"
2. El usuario escribe el valor y elige el tipo
3. El resumen de costos refleja precios netos
4. En la vista de detalle y PDF, aparece la columna de descuento solo si alguna línea lo tiene

