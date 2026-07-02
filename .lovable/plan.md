
## Diagnóstico

Hoy `InvoiceDetailBadges` pinta 3 chips que confunden y duplican información:

1. **`Cancelado`** — `StatusBadge` del estado interno de la factura.
2. **`CFDI Cancelado`** — estado fiscal ante el SAT.
3. **`PAC: Producción`** — entorno del PAC (Facturapi).

Problemas:
- **Redundancia**: cuando la factura está cancelada, los dos primeros dicen lo mismo con distinto wording. Igual pasa con `Pagada` (interno) + `Timbrado` (CFDI), que son ejes distintos pero se leen como ruido.
- **PAC: Producción es "siempre verde"**: para un usuario operativo no aporta valor en cada factura; sólo importa cuando estás en Sandbox (riesgo real de "creí que era real").
- **Cancelación en proceso**: hoy no hay chip para el limbo "solicitada · esperando SAT", que sí es información accionable.

## Propuesta

Reducir a **máximo 2 chips**, con jerarquía clara:

### Chip 1 — Estado fiscal (único, combina interno + CFDI)

Una sola fuente de verdad, calculada así:

| Situación                                              | Label                    | Tono         |
| ------------------------------------------------------ | ------------------------ | ------------ |
| Borrador                                               | `Borrador`               | neutral      |
| Timbrada, sin pagos                                    | `Timbrada`               | info         |
| Timbrada, parcial                                      | `Parcial`                | warning      |
| Timbrada, pagada                                       | `Pagada`                 | success      |
| Cancelación solicitada (pending_cancellation)          | `Cancelación en proceso` | warning      |
| Cancelada por SAT                                      | `Cancelada`              | destructive  |
| Timbrado pendiente / error                             | `Pendiente de timbrado`  | warning      |

Esto elimina el doble chip `Cancelado` + `CFDI Cancelado` y hace visible el estado "en proceso" que hoy sólo vive en un badge secundario.

### Chip 2 — Entorno PAC (sólo cuando importa)

- Mostrar **sólo** cuando `isLive === false` → chip `Sandbox` en amarillo.
- En Producción no se muestra nada (el default silencioso).

Justificación: el objetivo del badge es alertar de facturas de prueba; en producción se convierte en decoración.

### Resultado visual

- Factura FAC-0076 (actual): antes `Cancelado` · `CFDI Cancelado` · `PAC: Producción` → después **`Cancelada`** (solo un chip).
- Factura recién timbrada en sandbox: `Timbrada` · `Sandbox`.
- Factura pagada en producción: `Pagada` (un solo chip).

## Cambios técnicos

1. `src/features/invoices/components/invoice-detail/InvoiceDetailBadges.tsx`
   - Reemplazar los 3 badges por una función `resolveFiscalBadge({ invoiceStatus, cfdiStatus, hasPendingCancellation })` que devuelva `{ label, variant }`.
   - Renderizar el chip PAC sólo si `!isLive`, con label `Sandbox`.
2. Ajustar el sitio que consume `InvoiceDetailBadges` para pasar `hasPendingCancellation` (ya disponible en el detalle vía `cancellation_status`).
3. Añadir entrada al changelog `v6.104.10` (patch, UI): "Header de factura: consolidados 3 badges en un solo chip fiscal; PAC solo aparece en Sandbox."

Sin cambios de lógica de negocio ni de datos.
