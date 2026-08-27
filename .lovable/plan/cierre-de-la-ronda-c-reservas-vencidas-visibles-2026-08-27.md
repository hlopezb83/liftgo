# Cierre de la ronda C — reservas vencidas visibles

La ronda C quedó implementada salvo un pendiente operativo que sí verifiqué contra la base de datos.

## Lo que falta (verificado)

La reconciliación automática ya está en marcha: la función `reconcile_expired_bookings()` existe y corre todos los días a las 08:10 UTC. Por diseño sólo cierra reservas que tienen evidencia de devolución (inspección de retorno o recolección completada).

Eso deja un hueco: hoy hay **2 reservas confirmadas que terminaron el 25 de agosto** (unidades MCLTC025A048/005 y MCLTC025A048/012) sin ninguna devolución registrada. La automatización nunca las va a tocar — correctamente, porque nadie documentó el retorno — pero tampoco existe ninguna pantalla que le avise a operaciones que están ahí. Las unidades siguen marcadas como "Rentada" y no se pueden volver a rentar.

Revisé el módulo de reservas y no hay ningún indicador de vencimiento en la lista ni en el detalle.

## Qué construir

1. **Etiqueta "Vencida" en la lista de reservas**: toda reserva confirmada o activa cuya fecha de fin ya pasó muestra una etiqueta con los días de atraso, igual que ya hicimos en Entregas.
2. **Aviso resumen arriba de la lista**: "N reservas vencidas sin devolución registrada", con un filtro rápido para verlas solas.
3. **Filtro por vencidas** dentro de los filtros existentes de la tabla de reservas.
4. **Aviso en el detalle de la reserva**: cuando está vencida, un mensaje que explique que la unidad sigue ocupada hasta registrar la devolución, con el botón de inspección de retorno a la mano.
5. Sin cambios en la base de datos: la corrección de las 2 reservas actuales la hace el usuario desde la app registrando la devolución real (o cancelando), que es lo correcto contablemente.

## Alcance técnico

- Nuevo helper `src/features/bookings/lib/bookingOverdue.ts` (espejo de `deliveryOverdue.ts`): usa `nowMty()` y `parseDateLocal`, expone `bookingOverdueDays`, `isBookingOverdue`, `countOverdueBookings` y la etiqueta.
- `BookingsPage.tsx`: columna/celda con el badge de atraso, faceta "Vencidas" vía `useTableFilters`, aviso con el conteo.
- `BookingDetail.tsx`: banner de reserva vencida con acceso a registrar devolución.
- Pruebas unitarias del helper (incluyendo el corte de medianoche en Monterrey).
- Changelog y versión: `v7.364.0` (minor).
