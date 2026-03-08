

## Plan: Abrir diálogo al mover prospecto de etapa (v3.18.2)

Cuando se arrastra un prospecto a una nueva columna, automáticamente abrir el formulario de edición pre-llenado con los datos actuales y la nueva etapa ya seleccionada. Esto permite actualizar el valor del trato u otros campos antes de confirmar el cambio.

### Cambios

**`src/pages/CRMPage.tsx`**
- En `onDragEnd`: en lugar de hacer `updateProspect.mutate()` directamente, guardar el prospecto y la nueva etapa en estado local y abrir el diálogo de edición.
- Al guardar desde el diálogo, aplicar tanto el cambio de etapa como cualquier campo editado.
- Si el usuario cancela el diálogo, no se mueve el prospecto (se queda donde estaba).

**`src/components/crm/ProspectFormDialog.tsx`**
- Aceptar una nueva prop opcional `overrideStage` para pre-seleccionar la etapa destino cuando se abre por drag-and-drop.
- Mostrar un indicador visual de la nueva etapa (badge o texto) para que el usuario sepa a dónde se está moviendo.

**`src/lib/changelog.ts`** — entrada v3.18.2

### Flujo
1. Usuario arrastra tarjeta de "Nuevo Prospecto" a "Cotización Enviada"
2. Se abre el diálogo con los datos del prospecto, etapa ya cambiada a "Cotización Enviada"
3. Usuario actualiza valor del trato y guarda → se persiste todo junto
4. Si cancela → prospecto permanece en su etapa original

