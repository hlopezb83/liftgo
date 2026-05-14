# Early returns para estados de carga

Busqué pages/components donde el JSX principal se envuelve dentro de un `isLoading ? (…) : (…)` que podría volverse un `if (isLoading) return <skeleton/>;` para aplanar el render.

La mayoría del proyecto ya usa el patrón de early return (ej. `InvoiceDetail`, `ContractDetail`, etc.). Quedan **3 páginas** con ternarios "envolventes" que vale la pena refactorizar:

## Cambios

1. **`src/pages/ActivityPage.tsx`** (líneas 60-89)
   - Extraer el `isLoading` antes del `return`. Si está cargando, devolver el shell (`PageTransition` + `PageHeader` + filtro `Select`) con el skeleton y `return` temprano.
   - El `return` principal queda con la lista plana sin ternario envolvente.

2. **`src/pages/RolePermissionsPage.tsx`** (líneas 60-…)
   - Mismo patrón: si `isLoading`, devolver el shell con un loader centrado y `return`.
   - El `return` principal queda con la tabla plana.

3. **`src/pages/CRMPage.tsx`** (líneas 227-253)
   - Extraer un componente local `KanbanBoardSkeleton` (o `if (isLoading)` que renderice el shell con el skeleton de columnas) para evitar el ternario que envuelve todo el `DragDropContext`.
   - Como el shell tiene mucho contenido (sticky header, KPIs), aquí prefiero **extraer una variable** `kanbanContent = isLoading ? <Skeleton/> : <DragDropContext>…</DragDropContext>` declarada arriba del `return`, y usarla en su sitio. Eso aplana el JSX sin duplicar el shell.

## Fuera de alcance (se dejan como están)

- `CRMClosedPage.tsx` líneas 129/132 — ternario inline mínimo dentro de un `<TabsContent>`; refactor no aporta.
- `MrrDetailPage.tsx` línea 87 — `isLoading ? "…" : valor` dentro de un texto; trivial.
- Componentes con loaders propios (`DocumentAttachments`, `BookingStatusHistory`, `ProspectHistoryCard`, `InvoiceHistoryCard`, `CollectionNotesCard`, `RolePermissionsMatrix`, `ListPageLayout`) — son secciones internas reutilizables, su `isLoading` decide qué muestra la sección, no envuelven la página entera.
- Estados de error: a nivel página no se renderiza error UI (los hooks usan `toast` global vía `sonner` y `ErrorBoundary` para crashes). No hay oportunidad real de early-return de error sin agregar UI nueva, lo cual sería expandir alcance.

## Notas técnicas

- Cero cambios visuales o de comportamiento.
- En `ActivityPage` y `RolePermissionsPage`, el shell se duplica brevemente (header + filtro). Es el costo aceptable por aplanar el JSX principal y permitir un early return claro. Si alguno se vuelve mayor, se factorizaría a un wrapper, pero no es necesario aquí.
- En `CRMPage` se usa una variable local porque el shell es demasiado grande para duplicar.
- Agregar entrada `5.66.5` (patch) en `public/changelog.json` + `public/changelog/v5.66.5.json` titulada "Refactor: early returns para estados de carga en páginas".
