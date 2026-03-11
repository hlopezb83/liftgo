

# Cotización de Renta por Modelo (sin ID específico)

## Concepto
Cambiar el flujo de cotización de renta: en lugar de seleccionar montacargas específicos (IDs), el usuario selecciona **modelos de equipo** con cantidad y tarifas. Al **convertir a reserva**, se presenta un diálogo para asignar los montacargas específicos.

## Cambio en base de datos

### Agregar tarifas por defecto a `equipment_models`
```sql
ALTER TABLE equipment_models
  ADD COLUMN default_daily_rate numeric DEFAULT 0,
  ADD COLUMN default_weekly_rate numeric DEFAULT 0,
  ADD COLUMN default_monthly_rate numeric DEFAULT 0;
```
Esto permite que al seleccionar un modelo, se pre-llenen las tarifas. Se pueden editar en la configuración de Operaciones > Modelos de Equipo.

## Cambios por archivo

### `src/pages/QuoteForm.tsx`
- **Eliminar** la selección de montacargas específicos (`MultiForkliftSelector`, `useAvailableForklifts`, `forkliftIds`)
- **Reusar** el componente `SaleLineItems` (renombrado conceptualmente como "RentalLineItems") para cotizaciones de renta, pero adaptado:
  - Selector de modelo de equipo
  - Cantidad de unidades
  - Campos de tarifa: diaria, semanal, mensual (pre-llenados desde el modelo)
- Calcular `lineItems` usando `calculateRentalCost` con las tarifas ingresadas × cantidad
- Ya no se guarda `forklift_id` en la cotización de renta (se pone `null`)
- Guardar en `line_items` la info del modelo (model_id, tarifas) para uso posterior

### Nuevo tipo `RentalLine`
```typescript
interface RentalLine {
  modelId: string;
  quantity: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  discount: number;
  discountType: "%" | "$";
}
```

### Nuevo componente `src/components/RentalLineItems.tsx`
Similar a `SaleLineItems` pero con campos de tarifa diaria/semanal/mensual en lugar de precio unitario. Al seleccionar un modelo, se pre-llenan las tarifas desde `equipment_models`.

### `src/lib/invoiceUtils.ts`
- Agregar función `generateLineItemsFromModel(modelName, dailyRate, weeklyRate, monthlyRate, startDate, endDate)` que genera las partidas sin necesitar un forklift específico

### `src/pages/QuoteDetail.tsx` — Conversión a Reserva
- Al hacer clic en "Convertir a Reserva", mostrar un **diálogo de asignación de equipos**:
  - Para cada línea del modelo × cantidad, el usuario selecciona el montacargas específico disponible
  - Filtrar montacargas por modelo/fabricante y estado "available"
  - Solo proceder cuando todos los equipos estén asignados
- Crear una reserva por cada montacargas asignado (flujo actual)

### `src/components/operations/EquipmentModelsTab.tsx`
- Agregar campos de tarifa por defecto (diaria, semanal, mensual) al formulario de modelo de equipo

### `src/lib/changelog.ts`
- Registrar en nueva versión

## Flujo del usuario

1. **Crear cotización de renta**: selecciona modelo(s), cantidad, fechas → tarifas se pre-llenan → resumen de costos
2. **Enviar / Aceptar cotización**: flujo normal de estados
3. **Convertir a Reserva**: diálogo pide asignar montacargas específicos del inventario por cada línea → se crean las reservas

## Compatibilidad
- Las cotizaciones existentes con `forklift_id` seguirán funcionando en modo lectura
- La conversión de cotizaciones antiguas (con forklift_id) usará el flujo actual como fallback

