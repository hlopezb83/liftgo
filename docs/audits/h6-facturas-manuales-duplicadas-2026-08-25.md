# H-6 — Facturas manuales duplicadas por reserva (reporte previo al índice único)

Fecha: 2026-08-25

El parche H-6 propone `CREATE UNIQUE INDEX invoices_booking_manual_uniq ON public.invoices (booking_id) WHERE booking_id IS NOT NULL AND billing_period_start IS NULL AND status <> 'cancelled'`.

**Hoy ese índice no se puede crear:** existen 12 reservas con más de una factura activa sin periodo de facturación.

## Hallazgo importante

Al revisar los casos, la mayoría **no son errores de captura**: son facturaciones mensuales sucesivas de la misma reserva que se emitieron sin llenar `billing_period_start` (facturación manual mes a mes). Ejemplos:

| Reserva | Facturas activas | Observación |
|---------|------------------|-------------|
| RSV-0004 | FAC-0004, FAC-0006, FAC-0008, FAC-0010, FAC-0031, FAC-0042 | mismos $32,480 en fechas distintas (marzo–mayo) |
| RSV-0007 | FAC-0017…FAC-0020, FAC-0033, FAC-0044 | FAC-0019 está timbrada |
| RSV-0011 | FAC-0029, FAC-0035, FAC-0046 | mensualidades de $40,600 |
| RSV-0027 | FAC-0107, FAC-0110, FAC-0112 | las tres timbradas (incluye extensión) |
| RSV-0014/0015/0016/0017 | 2 facturas cada una, mismo día y mismo importe | probables duplicados reales |

## Conclusión

La regla "una sola factura manual por reserva" **es incorrecta para el modelo de negocio** (renta recurrente). Aplicar el índice tal cual bloquearía la facturación mensual legítima y, además, fallaría al crearse por los datos existentes.

## Recomendación

1. No aplicar `invoices_booking_manual_uniq`.
2. Si se quiere evitar duplicados reales, la unicidad correcta es por **reserva + periodo**, exigiendo `billing_period_start` en toda factura ligada a una reserva (el índice de `20260507184615` ya cubre ese caso) y migrando las facturas históricas para que declaren su periodo.
3. Los pares del mismo día e importe (RSV-0014, RSV-0015, RSV-0016, RSV-0017) requieren revisión manual del área de finanzas antes de cancelar la copia sobrante; varios ya tienen pagos aplicados.
