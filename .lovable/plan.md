
## Agregar "Servicio de Logistica" opcional a cotizaciones

### Resumen

Agregar un checkbox o toggle en el formulario de cotizaciones (tanto renta como venta) que permita incluir un "Servicio de Logistica" con un monto editable. Cuando se activa, se agrega automaticamente una linea adicional a los `line_items` con la descripcion "Servicio de Logistica" y el monto indicado.

### Cambios

**1. `src/pages/QuoteForm.tsx`**

- Agregar dos estados nuevos:
  - `includeLogistics: boolean` (default `false`)
  - `logisticsCost: number` (default `0`)
- Agregar una card/seccion con un Checkbox "Incluir Servicio de Logistica" y un input numerico para el monto cuando esta activado
- En el calculo de `lineItems` (useMemo), si `includeLogistics` es true y `logisticsCost > 0`, agregar al final del array un LineItem:
  ```text
  { description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost }
  ```
- Al cargar una cotizacion existente (useEffect), detectar si existe un line_item con descripcion que contenga "Logística" y restaurar los estados correspondientes
- Aplica tanto para tipo "rental" como "sale"

### Flujo de usuario

1. El usuario crea o edita una cotizacion (renta o venta)
2. Ve un checkbox "Incluir Servicio de Logistica"
3. Al activarlo, aparece un campo para ingresar el monto del servicio
4. El resumen de costos muestra la linea adicional "Servicio de Logistica"
5. Al guardar, se incluye como un line_item mas en el JSON

### Detalle tecnico

- 1 archivo modificado (`QuoteForm.tsx`)
- Sin componentes nuevos (se agrega inline en el form)
- Sin migraciones de base de datos (se almacena como un line_item mas en el campo jsonb existente)
- Compatible con PDF y vista de detalle existentes ya que leen de `line_items`
