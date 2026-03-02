

## Filtrar reservas ya facturadas y agregar trazabilidad de reserva en facturas

### Problema
1. El dropdown "Generar desde Reserva" en el formulario de nueva factura muestra todas las reservas confirmadas, incluyendo las que ya tienen una factura asociada. Esto permite crear facturas duplicadas.
2. En el detalle de una factura, se muestra la trazabilidad hacia la cotizacion origen (quote_id) pero no hacia la reserva origen (booking_id), perdiendo contexto operativo.

### Cambios

**1. `src/pages/InvoiceForm.tsx` - Filtrar reservas ya facturadas**

- Importar `useInvoices` para obtener la lista completa de facturas existentes.
- Extraer los `booking_id` de todas las facturas que no estan canceladas para formar un conjunto de IDs ya facturados.
- En el filtro del dropdown (linea 239), agregar condicion: solo mostrar reservas cuyo `id` NO este en el conjunto de booking_ids ya facturados.
- Excepcion: si estamos editando una factura existente, permitir que su propia reserva siga apareciendo.

Logica:
```text
const invoicedBookingIds = new Set(
  invoices?.filter(inv => inv.status !== 'cancelled' && inv.booking_id)
    .map(inv => inv.booking_id)
);

// En el dropdown:
bookings?.filter(b => b.status === "confirmed" && !invoicedBookingIds.has(b.id))
```

**2. `src/pages/InvoiceDetail.tsx` - Agregar trazabilidad de reserva**

- Usar el `booking_id` ya disponible en el objeto `invoice` para buscar la reserva vinculada (importar `useBookings` o hacer una query puntual con el hook existente, o simplemente construir el link directo).
- Agregar una tarjeta de trazabilidad similar a la existente para cotizaciones (la que muestra "Generada desde cotizacion: COT-XXXX"), pero para reservas:
  - Icono de calendario + texto "Generada desde reserva:" + badge con link al detalle de la reserva (si existiera una pagina de detalle) o a la pagina de reservas.
  - Mostrar el nombre del montacargas y las fechas de la reserva como contexto adicional.
- Posicionar esta tarjeta junto a (o debajo de) la tarjeta de cotizacion existente.

### Detalle tecnico

En `InvoiceForm.tsx`:
- Se agrega `const { data: invoices } = useInvoices();` (ya existe el hook).
- Se construye un `Set` con los booking_ids ya usados.
- El `.filter()` en linea 239 pasa de `b.status === "confirmed"` a `b.status === "confirmed" && !invoicedBookingIds.has(b.id)`.

En `InvoiceDetail.tsx`:
- Se busca la reserva vinculada consultando `bookings` filtrado por `invoice.booking_id`.
- Se agrega una Card debajo de la card de cotizacion con el patron:
```text
[CalendarIcon] Generada desde reserva: [Badge clickable -> /bookings]
  Montacargas: MCAPC025A048/001 | 20/10/2025 - 20/11/2025
```
- Si no hay `booking_id`, la card no se muestra.

