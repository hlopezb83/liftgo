

## Integración con Facturapi — Plan de Implementación

### Resumen

Conectar las Edge Functions existentes (`stamp-cfdi` y `cancel-cfdi`) con la API REST de Facturapi para timbrar y cancelar CFDI 4.0 reales ante el SAT. También agregar configuración del API key en Company Settings y guardar el ID de Facturapi en la tabla `invoices`.

---

### Prerrequisitos

El usuario debe crear una cuenta en [facturapi.io](https://www.facturapi.io) y obtener su API key (test o live). Se almacenará como secret en el backend.

---

### Cambios

**1. Secret: `FACTURAPI_API_KEY`**
- Solicitar al usuario que ingrese su API key de Facturapi mediante la herramienta `add_secret`
- Se usará en ambas Edge Functions

**2. Migración de base de datos**
- Agregar columna `facturapi_invoice_id` (text, nullable) a la tabla `invoices` para almacenar el ID del objeto factura en Facturapi
- Agregar columna `facturapi_mode` (text, nullable, default `'test'`) a `company_settings` para distinguir modo test/live

**3. `supabase/functions/stamp-cfdi/index.ts`** — Reemplazar mock con llamada real:
- Construir payload de Facturapi con datos del emisor (`company_settings`) y receptor (campos `receptor_*` de la factura)
- `POST https://www.facturapi.io/v2/invoices` con el API key en header `Authorization: Bearer sk_...`
- Guardar respuesta: `cfdi_uuid` (UUID fiscal), `cfdi_xml` (descargar XML), `facturapi_invoice_id`
- Actualizar `cfdi_status = 'stamped'`
- Mantener fallback stub si `FACTURAPI_API_KEY` no está configurado

**4. `supabase/functions/cancel-cfdi/index.ts`** — Reemplazar mock con llamada real:
- `DELETE https://www.facturapi.io/v2/invoices/{facturapi_invoice_id}` con motivo de cancelación
- Actualizar `cfdi_status = 'cancelled'`
- Mantener fallback stub si no hay API key

**5. `src/pages/CompanySettingsPage.tsx`** — Agregar sección de configuración PAC:
- Toggle para modo test/producción (`facturapi_mode`)
- Indicador visual del estado de conexión (si el secret existe)

**6. `src/pages/InvoiceDetail.tsx`** — Ajuste menor:
- Eliminar el sufijo "(modo prueba)" cuando `stub` sea `false` en la respuesta

**7. `src/lib/changelog.ts`** — Nueva entrada v5.12.0 (minor)

### Archivos modificados
- `supabase/functions/stamp-cfdi/index.ts`
- `supabase/functions/cancel-cfdi/index.ts`
- `src/pages/CompanySettingsPage.tsx`
- `src/pages/InvoiceDetail.tsx`
- `src/lib/changelog.ts`
- Migración SQL (nueva columna `facturapi_invoice_id` en `invoices`, `facturapi_mode` en `company_settings`)

### Notas técnicas
- Facturapi se llama vía `fetch()` desde Deno — no requiere SDK, solo REST con `Authorization: Bearer`
- El XML timbrado se descarga con `GET /v2/invoices/{id}/xml` después de crear la factura
- Si el secret no existe, las funciones siguen operando en modo stub (comportamiento actual)

