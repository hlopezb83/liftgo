

## Corregir filtro de disponibilidad para equipos con status "rented"

### Problema

El hook `useAvailableForklifts` (linea 39) solo muestra montacargas con `status === "available"`, descartando inmediatamente los que tienen status `"rented"`. Esto es incorrecto porque:

- La funcion `create_booking` marca el equipo como `rented` al crear una reserva, pero no existe logica para regresarlo a `available` cuando la reserva termina.
- Un equipo `rented` cuya reserva actual ya termino (o termina antes del nuevo periodo solicitado) deberia aparecer como disponible para nuevas cotizaciones/reservas.
- La verificacion real de disponibilidad ya existe en las lineas 40-48 (solapamiento de intervalos de fechas), pero nunca se ejecuta para equipos `rented` porque el filtro de status los descarta antes.

### Solucion

Cambiar el filtro de status en `useAvailableForklifts` para aceptar tanto `"available"` como `"rented"`, y dejar que la logica de solapamiento de fechas determine si el equipo realmente esta libre para el periodo solicitado. Los status `"maintenance"`, `"retired"` y `"sold"` siguen excluidos.

### Cambio

**`src/hooks/useAvailableForklifts.ts`** (linea 39)

Cambiar:
```typescript
if (f.status !== "available" || maintenanceDueIds.has(f.id)) return false;
```

Por:
```typescript
if ((f.status !== "available" && f.status !== "rented") || maintenanceDueIds.has(f.id)) return false;
```

Esto permite que equipos `rented` pasen al segundo filtro (solapamiento de fechas). Si sus reservas activas no se solapan con el periodo solicitado, apareceran en el dropdown.

### Impacto

- El dropdown de montacargas en cotizaciones y reservas mostrara correctamente equipos cuya renta actual no se solapa con el periodo seleccionado.
- No se requieren cambios en la base de datos ni en otros componentes.
- Los reportes y dashboards que usan `f.status === "rented"` para conteo visual no se ven afectados.
