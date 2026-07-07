# Reemplazar FAC-0079..0085 con facturas del periodo correcto (Julio 2026)

## Contexto verificado

- Las 7 facturas están **timbradas** (`cfdi_status = stamped`, `status = sent`).
- **Ninguna tiene pagos registrados** → no hay complementos de pago que cancelar antes.
- Ninguna es CFDI de crédito ni traslado: son facturas de ingreso PPD normales.
- Reservas afectadas ya tienen `last_billed_date = 2026-06-30` (sincronizado en v6.110.0), así que el próximo "Generar recurrentes" producirá Julio 2026 automáticamente.

| Folio  | Cliente                              | Periodo INCORRECTO | Total     | Reservas |
|--------|--------------------------------------|--------------------|-----------|----------|
| FAC-0079 | INDIMEX TRADING                    | 03/2026            | $40,600   | RSV-0011 |
| FAC-0080 | INDIMEX TRADING                    | 04/2026            | $139,200  | RSV-0014..0017 |
| FAC-0081 | STK INDUSTRIAS                     | 12/2025            | $55,680   | RSV-0003, RSV-0004 |
| FAC-0082 | HG RUBBER                          | 12/2025            | $23,200   | RSV-0006 |
| FAC-0083 | QUIMERA ESPECIALIDADES             | 12/2025            | $22,040   | RSV-0007 |
| FAC-0084 | INTERNACIONAL AGROINDUSTRIAL       | 01/2026            | $22,040   | RSV-0009 |
| FAC-0085 | EMPAQUES Y EMBALAJES GRUPO MACE    | 04/2026            | $25,520   | RSV-0012 |

## Paso a paso (por factura, se puede paralelizar entre clientes)

### 1. Avisar al cliente (antes de cancelar)

Enviar correo breve — plantilla sugerida:

> Estimado [cliente]: identificamos que la factura **[FOLIO]** por **$[TOTAL]** se emitió con un periodo equivocado. La cancelaremos ante el SAT hoy mismo y en su lugar recibirá **[FOLIO_NUEVO]** con el mismo importe y el periodo correcto de **julio 2026**. Su acuse de cancelación y la nueva factura llegarán en el mismo correo.

Esto evita rebotes cuando el cliente reciba el acuse de cancelación.

### 2. Cancelar CFDI ante el SAT

En LiftGo: **Facturación → abrir la factura → botón "Cancelar CFDI"**.

- **Motivo SAT: `01 – Comprobante emitido con errores con relación`** (es el motivo correcto porque va a reemplazarse por otra con folio fiscal distinto).
- Cuando el sistema pida el UUID del CFDI que reemplaza, **déjalo pendiente por ahora** (aún no existe). Alternativas:
  - Si la UI lo permite, capturar el UUID después de emitir la nueva factura (paso 4) y ligarla vía "sustituir CFDI".
  - Si la UI lo exige de una vez, cancelar con motivo `02 – Comprobante emitido con errores sin relación` para desbloquear el flujo. Documentar en las notas de la factura que se emitió reemplazo (con folio) por error de periodo.
- Confirmar en el detalle de la factura que `cfdi_status` cambia a `cancelled` y baja el acuse XML.

Repetir para las 7 facturas. Como ninguna tiene pagos, no hace falta cancelar complementos previamente.

### 3. Generar las facturas correctas (Julio 2026)

Una sola acción cubre las 7:

1. **Facturación → botón "Generar recurrentes"**.
2. En la vista previa deben aparecer 7 líneas elegibles, todas con periodo **01/07/2026 al 31/07/2026** (agrupadas por cliente — INDIMEX saldrá con 2 líneas separadas: 1 y 4 reservas). Verificar totales antes de confirmar (deben coincidir con la tabla anterior, salvo que alguna tarifa haya cambiado).
3. Confirmar → se crean como `draft`.

### 4. Timbrar las nuevas facturas

Desde el listado de facturas en `draft`:

1. Abrir cada nueva factura.
2. Validar RFC, CP fiscal, régimen y uso CFDI del receptor (v6.97.10/6.97.11 muestran diálogo accionable si el SAT rechaza).
3. Click **"Timbrar CFDI"**.
4. Anotar el UUID de cada nueva factura para el siguiente paso.

### 5. (Opcional pero recomendado) Ligar sustitución en cancelación

Si el paso 2 se cerró sin UUID de reemplazo:

- Volver a cada factura cancelada, ir a **notas** o al campo "CFDI que sustituye" y capturar el UUID nuevo. Esto mejora la trazabilidad contable aunque el SAT ya no lo requiera post-cancelación.

### 6. Reenviar al cliente

Desde cada nueva factura: **"Descargar PDF + XML"** o **"Enviar por correo"** con el mensaje anunciado en el paso 1.

### 7. Verificación final (Admin)

Correr en el reporte de facturación:

- Los 7 folios viejos aparecen con `status = cancelled` / `cfdi_status = cancelled`.
- Las 7 nuevas aparecen `stamped` con `billing_period_start = 2026-07-01`.
- `bookings.last_billed_date` para las 14 reservas queda en `2026-07-31` (auto-actualizado al generar).
- El Estado de Resultados de Julio muestra el ingreso; el de meses anteriores **ya no** lo duplica (las canceladas dejan de contar).

## Tiempo estimado

- Aviso a clientes (correo genérico): 10 min.
- Cancelaciones (7 × ~1 min timbrado SAT): 10-15 min.
- Generar recurrentes + timbrar 7: 15-20 min.
- Envío + verificación: 15 min.
- **Total: ~1 hora**, con validación en un solo turno.

## Riesgos y cómo mitigarlos

- **Rechazo SAT en el timbrado nuevo** (CFDI40148/CFDI40149): revisar CSF del cliente ANTES de timbrar; con `sanitizeLegalName` y v6.97.10 ya sale diálogo accionable.
- **Cliente ya contabilizó la factura vieja**: el correo del paso 1 lo previene. Si aun así reclama, el acuse de cancelación (paso 2) es suficiente evidencia.
- **Folios "quemados" 0079..0085**: quedan en la BD como cancelados; el próximo folio será el siguiente disponible. No se recomprime la secuencia (mismo criterio que CXP-0001..0005 en v6.92.1).
