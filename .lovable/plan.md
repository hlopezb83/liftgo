

## Plan: Vincular prospectos con cotizaciones y validar valor de trato (v3.18.3)

### Contexto

La tabla `quotes` ya tiene: `quote_number`, `customer_name`, `total`, `line_items`, `status`, `customer_id`. Es el lugar natural para vincular.

### Recomendación

Agregar una columna `quote_id` (uuid, nullable, FK a quotes) en la tabla `prospects`. Cuando un prospecto se mueve a "cotización enviada":

1. **`deal_value` se vuelve obligatorio** (validación en el formulario, mínimo > 0)
2. **Selector de cotización existente** — un combobox que filtre cotizaciones por nombre de empresa del prospecto. Al seleccionar una cotización, se auto-llena `deal_value` con el `total` de la cotización.
3. **Enlace visual** — en la tarjeta del Kanban, si tiene cotización vinculada, mostrar el número (ej. "COT-0012") como badge clicable que navega al detalle.

Esto conecta el ciclo comercial: el prospecto tiene visibilidad de qué se cotizó, cuánto, y su estatus.

### Campos adicionales útiles por etapa

| Etapa | Campos que se vuelven relevantes |
|---|---|
| contactado | `contact_person` (recomendado) |
| cotizacion_enviada | `deal_value` (obligatorio > 0), `quote_id` (opcional pero recomendado) |
| negociacion | Sin cambios adicionales |
| cerrado_ganado | Todo listo para convertir a cliente |

### Cambios técnicos

**Migración SQL:**
- `ALTER TABLE prospects ADD COLUMN quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;`

**`ProspectFormDialog.tsx`:**
- Cuando `stage === "cotizacion_enviada"` o posterior: `deal_value` se marca como obligatorio con validación > 0
- Agregar combobox de cotización (busca quotes por `customer_name` similar a `company_name` del prospecto)
- Al seleccionar cotización: auto-llenar `deal_value` con `quote.total`

**`useProspects.ts`:**
- Agregar `quote_id` al tipo `Prospect`

**`CRMPage.tsx`:**
- En la tarjeta Kanban: si tiene `quote_id`, mostrar badge con `quote_number`

**`changelog.ts`** — v3.18.3

### Archivos
- **Migración**: agregar `quote_id` a `prospects`
- **Editar**: `ProspectFormDialog.tsx`, `useProspects.ts`, `CRMPage.tsx`, `changelog.ts`

