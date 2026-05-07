## Problema actual

Hoy el CRM mezcla dos conceptos en el mismo Kanban:

- **Etapas activas del pipeline**: Nuevo Prospecto → Contactado → Cotización Enviada → Negociación. Son fases por las que un deal *fluye*.
- **Estados terminales**: Cerrado Ganado y Cerrado Perdido. NO son etapas, son resultados finales.

El botón "Cerrados: Ganados X · Perdidos Y" que despliega dos columnas extra es confuso porque:

1. Visualmente sugiere que se puede arrastrar libremente entre activos y cerrados, cuando "cerrar" debería ser una decisión deliberada (con razón, fecha real, monto final).
2. Las columnas de cerrados crecen indefinidamente y nunca se "limpian" — saturan el pipeline activo.
3. Mezcla deals vivos con histórico, ensuciando los KPIs visibles (total pipeline, conteos por etapa).
4. No hay forma natural de ver KPIs de conversión (win rate, deals ganados este mes, ciclo promedio).

## Best practices de la industria

**HubSpot, Pipedrive, Salesforce, Close, Attio** convergen en este patrón:

1. **El Kanban muestra SOLO deals abiertos.** Cerrar es un evento, no una columna.
2. **Acciones explícitas "Marcar como Ganado / Perdido"** en la tarjeta (no drag-and-drop a columna terminal). Drag a una "columna de cerrado" se considera anti-pattern porque el cierre requiere capturar metadata (razón perdido, fecha real cierre, monto final).
3. **Modal de confirmación al cerrar**:
  - Ganado: confirmar monto final, fecha cierre, link a cotización/contrato.
  - Perdido: razón obligatoria (precio, competencia, timing, sin presupuesto, no responde, otro) + nota.
4. **Vista separada para histórico cerrado** — pestaña/filtro "Ganados" y "Perdidos" con tabla (no Kanban), filtros por fecha, vendedor, razón.
5. **KPIs en el header del pipeline**: Win rate %, Ganados MTD ($ y #), Perdidos MTD, ciclo promedio. Reemplazan al botón confuso actual.

## Diseño propuesto

### 1. Pipeline (Kanban) — solo abiertos

Eliminar columnas Cerrado Ganado / Cerrado Perdido del Kanban. Eliminar el toggle "Cerrados: Ganados X · Perdidos Y" del header. El Kanban siempre muestra exactamente las 4 etapas activas.

### 2. Header con KPIs (reemplaza el toggle)

```text
[Pipeline activo: 12 deals · $1.2M]   [Win rate 30d: 42%]   [Ganados mes: 5 · $340k]   [Ver historial →]
```

El link "Ver historial" lleva a la vista de cerrados.

### 3. Acciones de cierre en la tarjeta / sheet

En `ProspectDetailSheet` (panel lateral del prospecto), agregar dos botones primarios al pie:

- **"Marcar como Ganado"** (verde) → abre `CloseWonDialog`
- **"Marcar como Perdido"** (outline rojo) → abre `CloseLostDialog`

Bloquear drag-and-drop hacia estados cerrados (ya estaba parcialmente: actualmente abre el form, lo cual es más confuso que útil).

### 4. Modales de cierre

**CloseWonDialog**:

- Monto final (pre-llenado con `deal_value`)
- Fecha de cierre (default hoy)
- Cotización vinculada (si existe)
- Nota opcional
- Confirmar → `stage = cerrado_ganado`, `closed_at = ...`, sale del Kanban

**CloseLostDialog**:

- Razón (select obligatorio): Precio · Competencia · Timing · Sin presupuesto · No responde · Otro
- Nota opcional (obligatoria si "Otro")
- Confirmar → `stage = cerrado_perdido`, `lost_reason`, `closed_at`

### 5. Vista de histórico cerrados (`/crm/cerrados`)

Pestañas: **Ganados** | **Perdidos**. Tabla densa zebra (siguiendo el patrón del proyecto) con columnas:
Empresa · Contacto · Valor · Fecha cierre · Vendedor · (Razón si perdido) · Acciones (reabrir → vuelve a "Negociación").

Filtros: rango de fechas, vendedor, razón pérdida.

### 6. Reabrir un deal cerrado

Acción "Reabrir" en la fila del histórico → vuelve a `negociacion` con audit trail.

## Cambios técnicos

### Schema (migración)

Agregar columnas a `prospects`:

- `closed_at timestamptz NULL`
- `lost_reason text NULL` (validación trigger: requerida si stage = cerrado_perdido)
- `final_amount numeric NULL` (monto real al cerrar ganado)

### Archivos a tocar

- `src/pages/CRMPage.tsx`: quitar `CLOSED_STAGES`, `showClosed`, `closedSummary`, botón toggle. Agregar componente `<CRMHeaderKPIs/>`.
- `src/components/crm/KanbanColumn.tsx`: sin cambios estructurales.
- `src/components/crm/ProspectDetailSheet.tsx`: agregar botones "Marcar Ganado/Perdido".
- **Nuevos**: `CloseWonDialog.tsx`, `CloseLostDialog.tsx`, `CRMHeaderKPIs.tsx`, `pages/CRMClosedPage.tsx` (con tabs ganados/perdidos), `hooks/useCRMMetrics.ts`.
- Routing: agregar `/crm/cerrados`.
- Deshabilitar destino drag a etapas cerradas (ya no existen como columna, problema desaparece).
- Constantes de razones de pérdida en `src/lib/constants/crm.ts`.

### RLS / permisos

`closed_at`, `final_amount`, `lost_reason` heredan políticas existentes de `prospects`. La acción "Marcar Ganado" sigue restringida a Admin (ya existe `canCloseDeal`). "Marcar Perdido" disponible para Ventas y Admin.

### Changelog

Entrada minor `v5.61.0` — "Rediseño de cierre de deals en CRM siguiendo best practices".

## Lo que NO se hace

- No tocar las etapas activas (Nuevo Prospecto, Contactado, Cotización Enviada, Negociación) — siguen igual.
- No tocar el flujo de conversión cotización → booking.
- No cambiar la forma compacta/cómoda de las tarjetas.

## Pregunta abierta antes de implementar

¿Quieres que la vista de histórico cerrados sea **una página separada** (`/crm/cerrados`) o un **drawer/sheet lateral** que se abre desde el botón "Ver historial"? La página separada permite filtros más ricos y bookmarkable; el drawer mantiene contexto del pipeline. Recomiendo página separada por consistencia con el resto del ERP.

Usa una pagina separada