## Objetivo
Corregir el bug donde los filtros de `Facturas` y `Facturas de Proveedor` sólo responden una vez y luego quedan desincronizados/congelados, sin tocar otros módulos.

## Diagnóstico probable
El patrón actual mezcla estado de filtros, `URLSearchParams`, query keys y tabla TanStack con objetos/callbacks recreados por render. En producción esto puede dejar a Radix Tabs/Select, TanStack Query o la tabla con referencias obsoletas, especialmente al cambiar entre filtros con resultados vacíos y filtros con datos.

## Plan de implementación
1. **Reproducir visualmente el bug**
   - Validar en `/invoices?status=overdue` la secuencia reportada: cambiar tab → funciona una vez → deja de actualizar → seleccionar `Borrador` vacío → vuelve a funcionar una vez.
   - Validar patrón equivalente en `/cuentas-por-pagar` con el selector de estatus.

2. **Blindar los filtros de Facturas**
   - Mantener `status`, búsqueda y rango en URL, pero estabilizar el controlador de filtros para que cada cambio produzca un estado/query key inequívoco.
   - Evitar depender de objetos `URLSearchParams` mutables entre renders.
   - Generar un `queryKey` estable por valores primitivos (`status`, `search`, `from`, `to`) en vez de depender de objetos recreados.
   - Forzar reset seguro de paginación al cambiar el “fingerprint” real del dataset, no sólo la identidad del arreglo.

3. **Blindar los filtros de Facturas de Proveedor**
   - Convertir el estado local de filtros a actualizaciones totalmente inmutables y estables.
   - Exponer un `filterKey`/fingerprint primitivo para que la tabla se reinicie correctamente cuando cambie cualquier filtro.
   - Memoizar KPIs y resultados filtrados sin depender de referencias ambiguas.

4. **Ajustar la tabla compartida sólo si es necesario**
   - Revisar `useLiftgoTable` para que no conserve row models/paginación obsoletos cuando cambia el filtro pero el arreglo mantiene tamaño o vuelve de vacío a datos.
   - Mantener compatibilidad con todas las demás tablas.

5. **Validación**
   - Probar visualmente secuencias repetidas en Facturas: `Vencidas → Borrador → Pagada → Parcial → Todas → Vencidas`, confirmando que URL, tab activo y filas cambian cada vez.
   - Probar visualmente Facturas de Proveedor alternando estatus varias veces y búsqueda.
   - Confirmar que no se rompen paginación, búsqueda ni exportación CSV.

6. **Changelog obligatorio**
   - Agregar nueva entrada al inicio de `public/changelog.json`.
   - Crear `public/changelog/v7.61.10.json` como patch con el resumen del fix.