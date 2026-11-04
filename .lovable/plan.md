# RSV-0030 (HERREN ENERGY): diagnóstico y solución propuesta

## Diagnóstico (verificado con lecturas, sin cambios)

- RSV-0030 viene de la cotización **COT-0445** (aceptada; sólo esa reserva).
- COT-0445 tiene dos partidas: renta mensual $17,500 × 12 y **un cargo: Servicio de Logística $2,500 × 1**.
- Facturas vinculadas a la reserva (todas timbradas, ninguna cancelada, todas del formato anterior sin rastreo de origen):
  - **FAC-0111** (19/08/2026): renta mensual $17,500 + **Servicio de Logística $2,500**.
  - **FAC-0128** (septiembre): sólo renta.
  - **FAC-0129** (octubre): sólo renta.

**Qué dispara el aviso:** la partida «Servicio de Logística» de **FAC-0111**. El sistema reconoce las rentas por su descripción, pero un cargo sólo cuenta si trae el vínculo a la partida de la cotización, y ese vínculo no existe. La revisión de cargos antiguos (`legacy_review_required`) sale verdadera, la validación de `recurringQuoteCharges` falla y la reserva queda en `quote_charge_review`. FAC-0128 y FAC-0129 no tienen nada que ver.

**Qué tipo de problema es:** es un **cargo que se podría cobrar dos veces**, no una renta antigua que el sistema no reconozca. La logística ya se cobró en FAC-0111, pero el sistema no tiene cómo comprobarlo. Por eso bloquea, y está bien que lo haga: si confiara a ciegas, volvería a cobrar los $2,500.

Analogía: es un boleto de estacionamiento ya pagado al que se le borró el código de barras. La caja no deja salir hasta que alguien confirme a mano que ya se pagó.

## Solución segura propuesta (no aplicada)

FAC-0111 está timbrada, así que **no se toca** su CFDI ni sus partidas.

1. Crear una **conciliación administrativa auditada**: un registro separado que diga «la partida de logística de FAC-0111 corresponde al cargo de logística de COT-0445, cantidad 1». Sólo la podrá hacer un administrador, con motivo obligatorio y sin borrar nada.
2. Ajustar la revisión de cargos antiguos y el cálculo de cantidad consumida para que tomen en cuenta esas conciliaciones. Con eso, COT-0445 quedaría con la logística consumida (1 de 1, nada pendiente) y sin aviso.
3. Agregar un botón «Conciliar cargo histórico» en la cotización o en la factura, que muestre las partidas sin vínculo y deje elegir a qué cargo corresponden. Nunca se asignará por descripción de forma automática.
4. Agregar pruebas: sin conciliación, la reserva sigue bloqueada; con la conciliación, se libera y la logística no se vuelve a cobrar; además, no se puede conciliar más cantidad de la cotizada.

Con esto, RSV-0030 volvería a entrar a la facturación recurrente sólo con la renta mensual.

## Detalles técnicos

- Condición exacta: hay una factura activa (`quote_charge_invoice_active`) con `quote_charge_tracking_version IS NULL`, vinculada por `bookings.id = invoices.booking_id`, que tiene una partida que no es renta generada (`quote_charge_is_generated_equipment_line` = falso) y no trae `source_quote_id`/`source_quote_line_id`.
- La nueva tabla de conciliaciones necesita RLS, permisos explícitos (GRANT), una función RPC de sólo administradores con auditoría, y cambios a `quote_has_legacy_charge_history` y `get_quote_charge_availability`. Todo eso va en una migración que se autorizaría aparte, porque la base de datos está en producción.
- Después se tendría que volver a desplegar `generate-recurring-invoices` sólo si cambia su validación. En principio no hace falta, porque lee la función RPC.
