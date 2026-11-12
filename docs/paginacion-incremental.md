# Paginación incremental por desplazamiento

LiftGo tiene más de un patrón de listado. Esta guía describe páginas
incrementales con `useInfiniteQuery` y `.range(from, to)`: paginación por
desplazamiento (**offset**), no keyset cursor basado en la última fila.

## Ejemplo actual

La consulta de facturas está en
`src/features/invoices/hooks/invoices/useInvoices.ts`. Lee páginas de tamaño
limitado con un rango derivado del índice de página; el componente puede
solicitar páginas adicionales.

El orden forma parte del resultado paginado. Al
cambiar filtros u orden se debe reiniciar desde la primera página para no
mezclar resultados. El query key debe incluir cada filtro que cambie el
conjunto de filas.

## Límite de listas simples

Otros hooks usan
`LIST_PAGE_LIMIT` de `src/lib/supabase/constants.ts` y `hasReachedListLimit()`
para advertir que una lista podría estar incompleta. No asumas que ese límite
es el tamaño de página de la consulta de facturas: son estrategias distintas.

## Filtro de stock bajo en Refacciones

`useInventoryPage` incluye `lowStockOnly` en la clave de caché y solicita
`p_low_stock: true` a `get_inventory_page` cuando el filtro está activo. La
migración `drizzle/migrations/0142_inventory_low_stock_filter.sql` aplica
`stock_quantity <= min_stock_level` antes del conteo, orden y paginación. El
indicador mantiene el conteo global de existencias bajas visible para la empresa;
la tabla combina el filtro con la búsqueda y la categoría.

La migración conserva la firma anterior de seis argumentos y la delega a la
nueva implementación con el filtro desactivado. Debe aplicarse en el entorno de
destino antes de habilitar esta opción allí, siguiendo [la política de
migraciones](./migrations.md). Las pruebas con PostgreSQL efímero verifican el
contrato y los permisos locales; no acreditan su aplicación en Lovable Cloud.

## Cuándo evaluar keyset pagination

Evalúa un cursor keyset sólo cuando el
volumen o los cambios frecuentes hagan costosos los offsets. Antes de migrar,
define una clave de orden estable y única, el comportamiento ante inserciones o
borrados entre páginas, el cursor opaco, el soporte de filtros y la navegación
hacia atrás. Mide el cambio y añade cobertura de regresión.

No mantengas una
lista estática de módulos candidatos. Prioriza con métricas recientes de
volumen, latencia y truncamiento. Confirma el comportamiento en el hook de
cada módulo antes de afirmar que usa cursor u offset.
