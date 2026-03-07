

## Plan: Formulario de Reporte de Daño Manual

### Problema
No existe forma de crear un registro de daño manualmente. Solo se generan desde inspecciones de devolución. Un operador que encuentra daño en almacén no puede reportarlo.

### Solución
Agregar un botón "Reportar Daño" en la página de Seguimiento de Daños que abra un diálogo para crear un nuevo registro. Los campos `booking_id`, `inspection_id` y `customer_id` serán opcionales ya que el daño puede no estar vinculado a una renta.

### Cambios

1. **Crear `src/components/ReportDamageDialog.tsx`**
   - Diálogo con formulario: seleccionar montacargas (requerido), cliente (opcional), descripción del daño (requerido), costo estimado (opcional)
   - Usa `useCreateDamageRecord` del hook existente
   - ForkliftSelector existente para elegir el montacargas
   - CustomerSelector existente para elegir cliente opcional

2. **Modificar `src/pages/DamageTrackingPage.tsx`**
   - Agregar botón "Reportar Daño" en el header (usando la prop `actions` de `ListPageLayout`)
   - Importar y renderizar `ReportDamageDialog`

3. **Actualizar `src/lib/changelog.ts`**
   - Entrada v3.12.0 con el nuevo formulario de reporte manual

### Sin cambios de base de datos
La tabla `damage_records` ya permite `booking_id`, `inspection_id` y `customer_id` como nullable. No se requiere migración.

### Acceso por roles
El `ReportDamageDialog` estará visible para admin, administrativo, dispatcher y mechanic (los mismos roles que tienen acceso de escritura a `damage_records` según las RLS policies existentes).

