# Arreglar "Error al crear entrega" al convertir cotizaciones con fecha pasada

## Qué pasó

La cotización `ae79b6d0...` arranca el 24/07/2026. Al convertirla a reserva, el diálogo "Reserva creada" intenta programar la entrega **exactamente en la fecha de inicio de la reserva**, sin permitir cambiarla. La base de datos tiene una regla que impide agendar entregas en el pasado, así que la rechaza con el mensaje que viste.

Analogía: es como si la app quisiera reservar mesa para el martes pasado. El restaurante (la base de datos) contesta "esa fecha ya pasó" y no hay forma de mover la fecha desde esa pantalla.

Verificado: el diálogo `PostBookingDeliveryDialog` manda `scheduled_date: startDate` fijo y el trigger `validate_delivery_not_in_past` rechaza cualquier fecha menor a hoy salvo que la entrega venga como `completed`.

## Qué se va a cambiar

1. **Fecha editable en el diálogo de entrega post-reserva**
   - Agregar un selector de fecha, precargado con la fecha de inicio de la reserva.
   - Si esa fecha ya pasó, precargar **hoy** y mostrar un aviso corto: "La reserva inició el 24/07/2026; ajusta la fecha o marca que ya se realizó".

2. **Casilla "Ya se realizó"** (mismo patrón que el formulario normal de entregas)
   - Al marcarla, la entrega se guarda como `completed`, lo que permite fechas pasadas y deja registro histórico correcto.

3. **Validación en el cliente antes de enviar**
   - Reutilizar la regla existente de `deliveryFormSchema` (no permitir fecha pasada salvo "ya se realizó"), para que el usuario vea el error en el campo y no como un toast rojo de base de datos.

4. **Corrección de zona horaria en la regla de la base de datos**
   - El trigger compara contra `CURRENT_DATE` (UTC). Después de las 18:00 en Monterrey el servidor ya está en el día siguiente, así que una entrega de "hoy" puede rechazarse sin razón. Cambiarlo a `today_mty()`, que ya existe en el proyecto.

## Detalles técnicos

- `src/features/bookings/components/bookings/PostBookingDeliveryDialog.tsx`: agregar `scheduledDate: z.date()` y `alreadyCompleted: z.boolean()` al schema local, usar `DateField`, default `parseDateLocal(startDate)` o `nowMty()` si es pasada; enviar `scheduled_date: toYMD(values.scheduledDate)` y `status: values.alreadyCompleted ? "completed" : "scheduled"`.
- Migración: `CREATE OR REPLACE FUNCTION public.validate_delivery_not_in_past()` sustituyendo `CURRENT_DATE` por `public.today_mty()`; sin cambios de tabla ni de permisos.
- Tests: casos en `deliveryFormSchema.test.ts` ya cubren la regla; añadir prueba del default de fecha del diálogo cuando `startDate` es pasada.
- Changelog: nueva entrada patch `v7.279.2` en `public/changelog.json` + `public/changelog/v7.279.2.json`.
