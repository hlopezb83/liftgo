

## Plan: Pipeline de Ventas CRM tipo Trello (v3.18.0)

### Resumen
Crear una nueva página CRM con un tablero Kanban drag-and-drop para rastrear prospectos de venta a través de 6 etapas, desde nuevo prospecto hasta cierre.

### Cambios

**1. Migración de base de datos — tabla `prospects`**
```sql
CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  deal_value numeric DEFAULT 0,
  stage text NOT NULL DEFAULT 'nuevo_prospecto',
  notes text,
  stage_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
-- RLS policies for admin, administrativo, dispatcher, auditor
-- Trigger for updated_at
```

Etapas: `nuevo_prospecto`, `contactado`, `cotizacion_enviada`, `negociacion`, `cerrado_ganado`, `cerrado_perdido`

**2. Nueva página `src/pages/CRMPage.tsx`**
- Tablero Kanban con 6 columnas usando `@hello-pangea/dnd` (ya instalado)
- Cada columna muestra header con nombre de etapa y suma total de valores
- Tarjetas con: nombre de empresa, persona de contacto, valor del trato en MXN
- Drag & drop entre columnas actualiza `stage` en la BD
- Botón "Nuevo Prospecto" abre diálogo para crear
- Diálogo para editar/eliminar prospectos existentes

**3. Nuevo hook `src/hooks/useProspects.ts`**
- `useProspects()` — fetch all prospects
- `useCreateProspect()` — insert
- `useUpdateProspect()` — update (incluye cambio de etapa por drag)
- `useDeleteProspect()` — delete

**4. Nuevo componente `src/components/crm/ProspectFormDialog.tsx`**
- Formulario: empresa, contacto, email, teléfono, valor del trato, notas
- Reutilizado para crear y editar

**5. Actualizar `AppSidebar.tsx`**
- Agregar "Pipeline CRM" en el grupo "Operaciones" con ícono `Target`

**6. Actualizar `App.tsx`**
- Agregar ruta `/crm` con roles `["admin", "dispatcher", "administrativo", "auditor"]`

**7. `src/lib/changelog.ts`** — v3.18.0

### Diseño visual
```text
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ Nuevo       │ Contactado  │ Cotización  │ Negociación │ Cerrado     │ Cerrado     │
│ Prospecto   │             │ Enviada     │             │ Ganado ✓    │ Perdido ✗   │
│ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │             │             │             │             │
│ │Empresa A│ │ │Empresa B│ │             │             │             │             │
│ │Juan Pérez│ │ │Ana López│ │             │             │             │             │
│ │$50,000  │ │ │$120,000 │ │             │             │             │             │
│ └─────────┘ │ └─────────┘ │             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

### Archivos
- **Crear**: `src/pages/CRMPage.tsx`, `src/hooks/useProspects.ts`, `src/components/crm/ProspectFormDialog.tsx`
- **Editar**: `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/lib/changelog.ts`
- **Migración**: nueva tabla `prospects` con RLS

