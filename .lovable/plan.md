

## Plan: Integrar fotos en el diálogo de Reporte de Daño

### Problema
Actualmente el operador debe primero crear el registro de daño y después expandirlo para subir fotos. El flujo ideal es capturar las fotos junto con el reporte en un solo paso.

### Enfoque
Integrar el `DragDropImageUploader` dentro del `ReportDamageDialog`, pero con un flujo en dos fases: primero se seleccionan/previsualizan las fotos localmente (sin subir), y al hacer clic en "Reportar" se crea el registro de daño y luego se suben las fotos asociadas a ese nuevo ID.

No se puede reutilizar `DragDropImageUploader` tal cual porque ese componente necesita un `entityId` desde el inicio. En su lugar, se extraerá la lógica de dropzone directamente en el diálogo y se subirán las fotos post-creación.

### Cambios

1. **Modificar `src/components/ReportDamageDialog.tsx`**
   - Agregar `useDropzone` para seleccionar fotos con previews locales (igual que `DragDropImageUploader`)
   - En `handleSubmit`: crear el `damage_record`, obtener el ID retornado, luego subir cada foto usando `useUploadDocument` con `entityType="damage_record"` y `entityId=nuevoId`
   - Mostrar zona de drop y grid de previews entre el campo de costo y los botones
   - Limpiar previews y revocar URLs en reset

2. **Actualizar `src/lib/changelog.ts`**
   - Entrada v3.12.1: fotos integradas en el formulario de reporte de daño

### Sin cambios de base de datos
Se reutiliza la tabla `documents` y el bucket `documents` existentes.

