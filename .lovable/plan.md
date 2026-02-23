

# Plan de Refactorizacion

## Resumen

Despues de revisar toda la aplicacion, identifique varias areas donde el codigo se repite o puede organizarse mejor. El objetivo es reducir duplicacion, mejorar la mantenibilidad y hacer mas facil agregar nuevas paginas en el futuro.

---

## 1. Extraer componente reutilizable de paginas de listado

**Problema**: Las paginas Fleet, InvoicesPage, ContractsPage, QuotesPage, MaintenancePage, DamageTrackingPage y DeliveriesPage repiten el mismo patron:
- PageTransition + PageHeader con acciones
- Barra de busqueda + filtros
- Card con Table + TablePagination
- Manejo de estado vacio y loading con TableSkeleton/EmptyRow

**Solucion**: Crear un componente `ListPageLayout` que encapsule este patron comun.

```text
+----------------------------------+
|  ListPageLayout                  |
|  +----------------------------+  |
|  | PageHeader + acciones      |  |
|  +----------------------------+  |
|  | Slot: filtros (children)   |  |
|  +----------------------------+  |
|  | Card > Table automática    |  |
|  |   - Loading skeleton       |  |
|  |   - Empty state            |  |
|  |   - Paginacion             |  |
|  +----------------------------+  |
+----------------------------------+
```

**Archivos nuevos**:
- `src/components/ListPageLayout.tsx`

**Archivos modificados** (simplificados):
- `src/pages/Fleet.tsx`
- `src/pages/InvoicesPage.tsx`
- `src/pages/ContractsPage.tsx`
- `src/pages/QuotesPage.tsx`
- `src/pages/DamageTrackingPage.tsx`

---

## 2. Centralizar filtros de busqueda y estado

**Problema**: Cada pagina de listado repite la misma logica de `useState` para search + statusFilter + la misma barra de busqueda con icono.

**Solucion**: Crear un hook `useListFilters` y un componente `SearchBar`.

**Archivos nuevos**:
- `src/hooks/useListFilters.ts` - hook que combina search, status filter y la logica de filtrado
- `src/components/SearchBar.tsx` - input con icono de busqueda reutilizable

---

## 3. Simplificar las rutas en App.tsx con RoleGuard repetido

**Problema**: En `App.tsx`, muchas rutas repiten `<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}>`. Hay al menos 15 rutas con este mismo patron.

**Solucion**: Crear un componente wrapper o un array de configuracion de rutas para reducir la repeticion.

**Archivo modificado**:
- `src/App.tsx` - usar un array de configuracion de rutas con metadata de roles

---

## 4. Traducir textos pendientes en ingles

**Problema**: Hay algunos textos que siguen en ingles:
- `DamageTrackingPage.tsx` linea 53: los estados de dano se muestran con `replace(/_/g, " ")` en vez de usar `STATUS_LABELS`
- `DamageTrackingPage.tsx` linea 77: formato de fecha usa `"MMM d, yyyy"` que muestra meses en ingles
- `AuthGuard.tsx` linea 27: "Loading your workspace..." esta en ingles
- `SERVICE_TYPES` en constants.ts estan en ingles ("Routine Inspection", "Oil Change", etc.)

**Archivos modificados**:
- `src/pages/DamageTrackingPage.tsx`
- `src/components/AuthGuard.tsx`
- `src/lib/constants.ts`

---

## 5. Eliminar casteos `as any` en CustomersPage

**Problema**: `CustomersPage.tsx` usa `(c as any).rfc` en multiples lugares, lo cual indica que el tipo `Customer` no incluye los campos fiscales.

**Solucion**: Actualizar el tipo `Customer` en `useCustomers.ts` para incluir los campos `rfc`, `regimen_fiscal`, `uso_cfdi`, `domicilio_fiscal_cp`.

**Archivos modificados**:
- `src/hooks/useCustomers.ts`
- `src/pages/CustomersPage.tsx`

---

## 6. Eliminar casteos `as any` en InvoiceForm

**Problema**: `InvoiceForm.tsx` usa `(existing as any).serie`, `(existing as any).folio`, etc. en multiples lineas (69-79).

**Solucion**: Extender el tipo de invoice para incluir campos CFDI, o crear un tipo `InvoiceWithCfdi`.

**Archivos modificados**:
- `src/hooks/useInvoices.ts`
- `src/pages/InvoiceForm.tsx`

---

## Orden de implementacion

1. **Traducciones pendientes** (impacto inmediato, sin riesgo)
2. **Corregir tipos para eliminar `as any`** (mejora seguridad de tipos)
3. **Crear SearchBar y useListFilters** (componentes base)
4. **Crear ListPageLayout** (usa los anteriores)
5. **Simplificar rutas en App.tsx** (ultimo, mas impacto en estructura)

## Seccion tecnica

### ListPageLayout - API propuesta

```text
<ListPageLayout
  title="Facturas"
  subtitle="Administrar facturacion"
  actions={<Button>Nueva</Button>}
  columns={columns}
  data={paginatedItems}
  isLoading={isLoading}
  emptyMessage="No se encontraron facturas"
  renderRow={(item) => <TableRow>...</TableRow>}
  filters={<SearchBar ... />}
/>
```

### useListFilters - API propuesta

```text
const { search, setSearch, statusFilter, setStatusFilter, filtered } =
  useListFilters(items, {
    searchFields: ["name", "model"],
    statusField: "status",
  });
```

### Configuracion de rutas

```text
const routes = [
  { path: "/invoices", component: InvoicesPage, roles: ["admin", "dispatcher"] },
  { path: "/fleet", component: Fleet },
  ...
];

// Renderizado automatico con map
routes.map(r => r.roles
  ? <Route path={r.path} element={<RoleGuard allowed={r.roles}><r.component /></RoleGuard>} />
  : <Route path={r.path} element={<r.component />} />
)
```

