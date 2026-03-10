

# Reasignar cliente al convertir cotización de "Público en General"

## Problema
Cuando una cotización está asignada a "Público en General" (cliente genérico mexicano), al convertir a reserva se necesita asignar un cliente real.

## Solución
Agregar un diálogo intermedio que aparezca al hacer clic en "Convertir a Reserva" cuando el cliente de la cotización sea "Público en General" (detectado por nombre). Este diálogo permite seleccionar un cliente existente antes de proceder.

## Flujo
1. Usuario hace clic en "Convertir a Reserva"
2. Si `customer_name` contiene "público en general" (case-insensitive), se abre un diálogo de selección de cliente
3. Usuario selecciona cliente real → se actualiza la cotización con el nuevo `customer_id` y `customer_name`
4. Continúa el flujo normal de conversión (diálogo recurrente si aplica, luego crear reservas)

## Cambios

### `src/pages/QuoteDetail.tsx`
- Agregar estado `showCustomerReassignDialog`
- En `handleConvertClick`, detectar si es "público en general" → abrir diálogo de reasignación en lugar de convertir directamente
- Nuevo `Dialog` con `CustomerSelector` para elegir cliente
- Al confirmar, actualizar la cotización (`updateQuote`) con el nuevo cliente y luego proceder con la conversión
- Importar `CustomerSelector` y agregar lógica de estado para `reassignCustomerId` / `reassignCustomerName`

