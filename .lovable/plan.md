# Facturar la extensión de una reserva (RSV-0027)

## Qué está pasando hoy

Revisé la reserva y los datos confirman el diagnóstico:

- **RSV-0027** (JAIME ARTURO MENDOZA MIRELES): 05-ago al 11-ago, extendida el 13-ago a **18-ago**. Tiene `recurring_billing = false` y `monthly_rate = 0` — es una renta corta, no una suscripción mensual.
- Ya tiene la factura **FAC-0107** (pagada) por "Renta diaria" 17,500 + logística 5,000, que cubre el período original.
- La extensión quedó registrada en `booking_extensions` (11-ago → 18-ago), pero **ningún proceso la convierte en dinero facturable**.

Por qué no aparece en "Facturas recurrentes": ese motor solo toma reservas con `recurring_billing = true` y en estado `confirmed`, y factura **meses de calendario completos**. RSV-0027 no cumple ninguna de las dos cosas, así que nunca va a salir ahí — por diseño.

Por qué tampoco se puede facturar a mano hoy: el formulario de factura ofrece "Generar desde Reserva(s)" pero **filtra las reservas que ya tienen factura**. RSV-0027 ya tiene FAC-0107, así que desaparece de la lista. La única salida actual es crear una factura suelta y teclear la partida a mano, sin quedar ligada a la reserva.

Analogía: la extensión es como pedir dos noches más de hotel al salir. El hotel lo anotó en la libreta de la habitación, pero nadie mandó el cargo a la cuenta — y la caja ya marcó esa cuenta como "cerrada".

## Opciones

**Opción A — Facturar la extensión a mano (hoy, sin cambios).**
Factura nueva → cliente → partida manual "Renta 12–18 ago". Funciona ya, pero sin trazabilidad, sin prefill de tarifas y sin quedar ligada a la reserva. Sirve como parche inmediato para RSV-0027.

**Opción B (recomendada) — Flujo explícito "Facturar extensión".**
Cada extensión se vuelve un evento facturable con su propio estado.

**Opción C — Solo relajar el filtro del formulario.**
Permitir reseleccionar una reserva ya facturada. Es la mitad del trabajo de B y deja el riesgo de refacturar el período original.

Propongo implementar **B**, que incluye lo necesario de C.

## Alcance propuesto (Opción B)

1. **Marcar extensiones como facturables/facturadas**
   Agregar a `booking_extensions` las columnas `invoice_id` (FK a `invoices`, nullable) y `billed_at`. Migración con GRANT + RLS por rol siguiendo las reglas del proyecto.

2. **Cálculo del cargo de extensión**
   Nuevo helper de dominio que calcula las partidas del tramo `original_end_date + 1` → `new_end_date`, reutilizando `calculateRentalCost` con las tarifas pactadas de la reserva (diaria/semanal/mensual, con fallback al equipo). Para RSV-0027 serían 7 días a tarifa diaria/semanal.

3. **Botón "Facturar extensión" en `BookingExtensionsCard`**
   Visible solo para roles con permiso de facturación y solo cuando la extensión no tiene `invoice_id`. Navega a `/invoices/new?extension_id=...` y muestra chip "Facturada · FAC-XXXX" cuando ya lo está.

4. **Prefill del formulario de factura desde la extensión**
   Nuevo caso en `useInvoicePrefill` / `invoiceFormBuilders`: carga cliente, datos fiscales, la reserva (permitida aunque ya tenga factura previa) y la partida del tramo extendido con descripción con fechas y número de serie del equipo.

5. **Al guardar**
   Vincular la factura a la reserva vía `invoice_bookings` y sellar `booking_extensions.invoice_id` + `billed_at`.

6. **Reservas recurrentes**
   Para reservas con `recurring_billing = true` no se cambia nada: al extender el `end_date`, el motor mensual ya cubre los meses adicionales de forma automática. La extensión dentro del mismo mes ya viene incluida en la mensualidad, así que ahí el botón no aplica y se indica con una nota en la tarjeta.

7. **Visibilidad en el modal de recurrentes**
   Agregar en la vista previa una nota que aclare que solo lista rentas mensuales, con enlace a las extensiones pendientes de facturar, para que no se busque ahí lo que no vive ahí.

## Notas técnicas

- Archivos principales: `supabase/migrations/` (nueva), `src/features/bookings/components/booking-detail/BookingExtensionsCard.tsx`, `src/features/bookings/hooks/bookingActions/useBookingExtensions.ts`, `src/features/invoices/hooks/useInvoiceFormLogic.ts` (relajar `invoicedBookingIds` cuando venga `extension_id`), `src/features/invoices/hooks/invoiceForm/useInvoicePrefill.ts` + `invoiceFormBuilders.ts`, `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts`, nuevo helper en `src/lib/domain/`.
- Tests: unitarios del cálculo del tramo (borde: extensión de 1 día, extensión que cruza de mes, tarifa 0) y del guard que impide facturar dos veces la misma extensión.
- Changelog: entrada `minor`.

## Para RSV-0027 en concreto

Una vez implementado, entras al detalle de la reserva → tarjeta de Extensiones → "Facturar extensión" → sale la factura por los 7 días del 12 al 18 de agosto, ligada a la reserva y a la extensión.
