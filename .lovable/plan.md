
# Feature 2: Indicador Visual de Facturacion Recurrente

## Que hace
Agrega un indicador visual enriquecido en cada reserva con facturacion recurrente, mostrando:
- Un badge "Recurrente" claramente visible
- La ultima fecha facturada (o "Sin facturar" si aun no se ha generado ninguna)
- La proxima fecha esperada de facturacion (last_billed_date + 30 dias)

## Donde se muestra
1. **Pagina de Calendario** - En la lista de reservas (seccion inferior), reemplazar el icono `Repeat` solitario por un bloque informativo con las fechas de facturacion
2. **Vista de Lista de Equipos** - En el `BookingRow` del `EquipmentListView`, agregar indicador para reservas recurrentes

## Cambios tecnicos

### Archivo: `src/components/RecurringBillingBadge.tsx` (nuevo)
Crear un componente reutilizable que recibe una reserva y muestra:
- Badge con icono `Repeat` y texto "Recurrente"
- Linea de texto con "Ult. factura: [fecha]" o "Sin facturar aun"
- Linea de texto con "Prox. factura: [fecha calculada]" (last_billed_date + 30 dias, o start_date + 30 si nunca se ha facturado)
- Solo se renderiza si `booking.recurring_billing` es `true`
- Usa `Tooltip` para mostrar detalles sin ocupar mucho espacio en la fila

### Archivo: `src/pages/CalendarPage.tsx`
- Reemplazar el icono `Repeat` standalone (linea 172) por el nuevo componente `RecurringBillingBadge`
- Pasar la reserva completa al componente

### Archivo: `src/components/calendar/EquipmentListView.tsx`
- En el componente `BookingRow`, agregar `RecurringBillingBadge` para mostrar el indicador junto al nombre del cliente

## Logica de calculo de fechas
```
Si recurring_billing = true:
  Si last_billed_date existe:
    proximaFactura = last_billed_date + 30 dias
  Sino:
    proximaFactura = start_date + 30 dias
```

## Diseno visual
- Badge compacto con fondo `primary/10` y texto `primary`
- Tooltip al hacer hover que muestra las dos fechas en detalle
- Se integra de forma natural en las filas existentes sin romper el layout
