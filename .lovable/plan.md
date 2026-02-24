
# Traduccion completa del modulo de Actividad y revision general

## Problema encontrado
El modulo de Actividad muestra texto en ingles en tres lugares:

1. **Titulos**: "INSERT forklifts", "UPDATE forklifts" (vienen directamente de la base de datos)
2. **Descripciones**: "A forklifts record was updated" (tambien de la base de datos)
3. **Badges de evento**: "INSERT" y "UPDATE" se muestran tal cual porque `StatusBadge` no tiene traducciones para estos valores

La raiz del problema es un trigger en la base de datos (`log_activity`) que genera el titulo y descripcion en ingles usando las variables internas de PostgreSQL (`TG_OP`, `TG_TABLE_NAME`).

## Solucion

### 1. Actualizar el trigger de base de datos
Modificar la funcion `log_activity()` para que genere titulos y descripciones en espanol. El trigger usara un mapeo interno para traducir los nombres de tablas y acciones:

- `INSERT` -> "Creacion"
- `UPDATE` -> "Actualizacion"  
- `DELETE` -> "Eliminacion"
- `forklifts` -> "Montacargas"
- `bookings` -> "Reservas"
- `invoices` -> "Facturas"
- etc.

Ejemplo del resultado:
- Titulo: "Creacion de Montacargas" (en lugar de "INSERT forklifts")
- Descripcion: "Se creo un registro de Montacargas" (en lugar de "A forklifts record was insertd")

### 2. Agregar traducciones al frontend como respaldo
En `src/lib/constants.ts`, agregar las traducciones de `INSERT`, `UPDATE` y `DELETE` al mapa `STATUS_LABELS` para que `StatusBadge` los muestre correctamente.

### 3. Traducir el titulo y descripcion en el componente de Actividad
En `src/pages/ActivityPage.tsx` y `src/components/dashboard/RecentActivity.tsx`, agregar mapas de traduccion para que los registros existentes (ya guardados en ingles) se muestren en espanol. Esto cubre tanto los datos nuevos como los historicos.

## Cambios especificos

### Archivo: Migracion SQL (nuevo)
- Reemplazar la funcion `log_activity()` con una version que genera texto en espanol
- Usar `CASE` statements para traducir `TG_OP` y `TG_TABLE_NAME`

### Archivo: `src/lib/constants.ts`
- Agregar a `STATUS_LABELS`: `INSERT: "Creacion"`, `UPDATE: "Actualizacion"`, `DELETE: "Eliminacion"`

### Archivo: `src/pages/ActivityPage.tsx`
- Agregar mapas de traduccion para `event_type` y `entity_type`
- Reemplazar `a.title` y `a.description` con versiones traducidas al renderizar cada tarjeta
- Esto asegura que datos historicos en ingles se muestren correctamente

### Archivo: `src/components/dashboard/RecentActivity.tsx`
- Aplicar las mismas traducciones de titulo y descripcion al widget del Panel

## Resultado esperado
- Datos nuevos se generan directamente en espanol desde la base de datos
- Datos historicos en ingles se traducen en la interfaz
- Los badges muestran "Creacion", "Actualizacion", "Eliminacion" en lugar de "INSERT", "UPDATE", "DELETE"
- Titulos como "Creacion de Montacargas" en lugar de "INSERT forklifts"
- Descripciones como "Se creo un registro de Montacargas" en lugar de "A forklifts record was insertd"
