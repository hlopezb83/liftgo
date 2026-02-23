

# Traducir palabras en inglés visibles en la Bitácora de Cambios

## Problema

En la página de Bitácora de Cambios (/audit), el usuario ve varias palabras en inglés:

- **Columna "Acción"**: muestra "INSERT", "UPDATE", "DELETE" directamente
- **Columna "Tabla"**: muestra nombres de tablas en inglés como "bookings", "invoices", "damage records", etc.
- **Título del diálogo de detalle**: muestra "INSERT -- bookings", "UPDATE -- invoices", etc.
- **Campos modificados**: los nombres de columnas de la base de datos aparecen en inglés (ej. "start_date", "customer_name")

El resto de la aplicación ya está correctamente en español mexicano.

## Solución

Agregar mapas de traducción en `AuditTrailPage.tsx` para convertir estos valores internos a etiquetas en español.

### Cambios en `src/pages/AuditTrailPage.tsx`

1. **Mapa de acciones** -- traducir las acciones de la base de datos:
   - "INSERT" → "Creación"
   - "UPDATE" → "Actualización"  
   - "DELETE" → "Eliminación"

2. **Mapa de tablas** -- reutilizar las etiquetas que ya existen en el arreglo `TABLES` para traducir los nombres visibles:
   - "bookings" → "Reservas"
   - "invoices" → "Facturas"
   - "forklifts" → "Montacargas"
   - "customers" → "Clientes"
   - etc.

3. **Mapa de campos comunes** -- traducir los nombres de columna más frecuentes:
   - "status" → "Estado"
   - "start_date" → "Fecha Inicio"
   - "end_date" → "Fecha Fin"
   - "customer_name" → "Nombre del Cliente"
   - "total" → "Total"
   - "description" → "Descripción"
   - etc.

4. Aplicar estas traducciones en:
   - El Badge de acción en la tabla
   - La columna de tabla
   - El título del diálogo de detalle
   - La lista de campos modificados
   - Los encabezados de la tabla de cambios en el detalle

Solo se modifica **un archivo**: `src/pages/AuditTrailPage.tsx`.
