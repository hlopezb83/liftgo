

## Deshabilitar "Convertir a Reserva" en cotizaciones ya convertidas

### Problema
Cuando una cotización se acepta y se convierte a reserva, el botón "Convertir a Reserva" sigue activo, permitiendo crear reservas duplicadas.

### Solución
Consultar si ya existe una reserva vinculada a esta cotización (via `quote_id` en la tabla `bookings`) y ocultar/deshabilitar el botón si es así.

### Cambios

**`src/pages/QuoteDetail.tsx`**
- Agregar una consulta a `bookings` filtrando por `quote_id = quote.id` para verificar si ya existe una reserva creada desde esta cotización
- Condicionar el botón "Convertir a Reserva" para que no se muestre si ya hay una reserva vinculada
- Opcionalmente mostrar un badge o texto indicando que ya fue convertida, con enlace a la reserva

### Detalle técnico
- Usar una query simple con `supabase.from("bookings").select("id").eq("quote_id", quote.id).maybeSingle()`
- Si retorna un registro, ocultar el botón de "Convertir a Reserva"
- No se requieren cambios en base de datos ya que la columna `quote_id` en `bookings` ya existe

