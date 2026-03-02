
## Crear una reserva por cada montacargas en cotizaciones multi-equipo

### Problema
Cuando una cotizacion de renta tiene multiples montacargas (almacenados en `line_items`), la funcion `convertToBooking` solo crea **una** reserva usando `quote.forklift_id` (el primer equipo). El segundo montacargas se ignora completamente.

En el caso de COT-0002, los line_items contienen:
- MCAPC025A048/001 (forklift_id almacenado en `quote.forklift_id`)
- MCAPC035A048/003 (solo existe en `line_items`, sin reserva)

### Solucion
Modificar la logica de conversion para iterar sobre todos los montacargas del `line_items`, creando una reserva individual por cada uno y vinculandolas a la cotizacion.

### Cambios

**1. `src/pages/QuoteDetail.tsx` - funcion `convertToBooking`**
- Extraer los IDs de todos los montacargas desde `line_items` (buscando coincidencia por nombre en la lista de forklifts cargados, mismo patron que usa `QuoteForm`)
- Iterar sobre cada forklift_id encontrado y llamar a `createBooking.mutateAsync` para cada uno
- Vincular todas las reservas creadas a la cotizacion mediante `quote_id`
- Actualizar el estado de la cotizacion a "accepted" solo despues de crear todas las reservas
- Mostrar el dialogo de entrega para la primera reserva creada (o un resumen)

**2. `src/hooks/useBookings.ts` - sin cambios**
- La funcion RPC `create_booking` ya maneja correctamente un solo montacargas; se reutiliza llamandola N veces.

### Detalle tecnico

```text
Flujo actual:
  convertToBooking() -> createBooking(quote.forklift_id) -> 1 reserva

Flujo corregido:
  convertToBooking() -> 
    extraer forklift IDs de line_items (matching por nombre)
    para cada forklift_id:
      createBooking(forklift_id) -> reserva individual
    vincular todas con quote_id
    marcar cotizacion como "accepted"
```

La extraccion de IDs usa el mismo patron existente en `QuoteForm.tsx` lineas 119-122:
```typescript
const matched = allForkliftsFromHook.find((f) => item.description?.includes(f.name));
```

### Consideraciones
- Si algun montacargas falla al crear la reserva, se detiene y muestra error (las reservas ya creadas permanecen)
- El dialogo post-booking de entrega se mostrara para el primer montacargas; las demas entregas se pueden programar desde la pagina de entregas
- La columna `quote_id` ya soporta multiples reservas apuntando a la misma cotizacion (no tiene constraint UNIQUE)
