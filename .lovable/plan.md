## Diagnóstico

El problema más probable ya no es visual ni de memoización: la página de Facturas carga sólo los primeros 25 registros y después aplica los filtros en el navegador. En producción, donde hay más datos, los filtros por estado, búsqueda o fecha sólo revisan ese subconjunto, por eso parecen incompletos o incorrectos.

## Plan de corrección

1. **Mover los filtros de Facturas a la consulta de datos**
   - Hacer que `useInvoices` acepte filtros: búsqueda, estado, rango de emisión.
   - Aplicar esos filtros directamente en la consulta al backend antes del `.limit(25)`.
   - Mantener `overdue` como caso especial: facturas `sent` o `partial` con `due_date` vencida.

2. **Simplificar el hook de filtros de Facturas**
   - Usar `useInvoicesFilters` principalmente para leer/escribir URL params (`status`, `q`, `from`, `to`).
   - Evitar filtrar otra vez del lado cliente salvo como respaldo mínimo.
   - Mantener la API actual para no romper `InvoicesFiltersBar`.

3. **Actualizar la tabla para usar resultados ya filtrados**
   - Pasar a `useResourceList` el arreglo que ya llega filtrado desde backend.
   - Revisar que exportar CSV use el mismo dataset visible.
   - Si cambia un filtro, asegurar que la paginación no deje la tabla en una página vacía.

4. **Validación visual**
   - Abrir `/invoices?status=partial`.
   - Cambiar entre tabs de estado.
   - Probar búsqueda por número/cliente.
   - Probar rango de fecha de emisión.
   - Confirmar que la tabla sí cambia y que no se queda limitada a los primeros 25 registros sin aplicar filtros.

5. **Changelog obligatorio**
   - Agregar entrada nueva en `public/changelog.json`.
   - Crear el detalle correspondiente `public/changelog/v7.61.9.json` como patch fix.