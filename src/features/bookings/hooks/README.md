# `bookings/hooks/` — organización

Estructura recomendada (aplicada de forma incremental — v6 audit P3-9):

- `bookings/` — CRUD principal (`useBookings`, `useBookingMutations`).
- `bookingDetail/` — vistas detalle (`useBookingDetail`, extensiones, cancelación).
- `bookingForm/` — hooks de formularios (`useBookingFormLogic`).

Cuando agregues nuevos hooks, colócalos en la sub-carpeta que corresponda antes de crear un archivo suelto en la raíz.
