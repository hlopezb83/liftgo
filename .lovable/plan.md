

## Columnas ordenables en todas las tablas

Agregar la funcionalidad de ordenar datos haciendo clic en los encabezados de columna en todas las tablas de la aplicacion. Se mostrara un indicador visual (flecha arriba/abajo) en la columna activa.

### Arquitectura

Se crea un hook reutilizable `useSort` y un componente `SortableTableHead` que reemplaza a `TableHead` en los encabezados. El ordenamiento se aplica sobre los datos filtrados, antes de la paginacion.

### Nuevos archivos

**1. `src/hooks/useSort.ts`**
- Hook generico `useSort<T>(items, defaultSortKey?, defaultDirection?)`
- Estado: `sortKey` (string | null), `sortDirection` ("asc" | "desc")
- Funcion `toggleSort(key)`: si es la misma columna cambia direccion, si es otra columna ordena ascendente
- Retorna `{ sortKey, sortDirection, toggleSort, sortedItems }`
- Soporta comparacion de strings (case-insensitive), numeros, y fechas (strings ISO)
- Acepta un `sortFns` opcional para columnas con logica de acceso personalizada (ej: `forklifts?.name`)

**2. `src/components/SortableTableHead.tsx`**
- Componente que envuelve `TableHead` y agrega:
  - Cursor pointer + hover visual
  - Icono `ArrowUpDown` cuando la columna esta inactiva
  - Icono `ArrowUp` o `ArrowDown` cuando la columna esta activa
  - Props: `sortKey`, `currentSort`, `currentDirection`, `onSort`, `children`, mas las props normales de TableHead
- Las columnas sin `sortKey` se renderizan como `TableHead` normal (ej: columna de acciones)

### Cambios en archivos existentes

**3. `src/hooks/useListFilters.ts`**
- Agregar integracion opcional con sort: el hook seguira retornando `filtered`; el sort se aplica despues en cada pagina

**4. Flujo de datos en cada pagina (patron estandar):**

```text
datos crudos -> useListFilters (filtrado) -> useSort (ordenamiento) -> usePagination (paginacion)
```

Actualmente el flujo es: `datos -> useListFilters -> usePagination`. Se inserta `useSort` entre ambos.

**5. Paginas a modificar (10 paginas):**

| Pagina | Columnas ordenables |
|---|---|
| Fleet.tsx | ID, Modelo, Fabricante, Capacidad, Altura, Combustible, Estado, Tarifa Diaria |
| BookingsPage.tsx | Equipo, Cliente, Inicio, Fin, Estado |
| InvoicesPage.tsx | Factura #, Cliente, Total, Estado, Emitida, Vencimiento |
| CustomersPage.tsx | Nombre, RFC, Correo, Telefono, Persona de Contacto |
| ContractsPage.tsx | Contrato #, Cliente, Equipo, Inicio, Fin, Estado |
| QuotesPage.tsx | Cotizacion #, Cliente, Total, Estado, Valida Hasta |
| MaintenancePage.tsx | Fecha, Montacargas, Tipo de Servicio, Realizado Por, Costo, Proximo Servicio |
| DeliveriesPage.tsx | Fecha, Tipo, Montacargas, Direccion, Operador, Estado |
| DamageTrackingPage.tsx | Fecha, Montacargas, Cliente, Costo Est., Estado |
| ReturnInspectionPage.tsx | columnas existentes |

En cada pagina:
- Importar `useSort` y `SortableTableHead`
- Insertar `useSort(filtered, ...)` entre `useListFilters` y `usePagination`
- Reemplazar `<TableHead>Columna</TableHead>` por `<SortableTableHead sortKey="campo" ...>Columna</SortableTableHead>`
- Las columnas de acciones o sin datos ordenables se dejan como `TableHead` normal

### Ejemplo de uso (Fleet.tsx)

```text
const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(filtered, {
  defaultKey: "name",
  accessors: {
    name: (f) => f.name,
    model: (f) => f.model,
    manufacturer: (f) => f.manufacturer || "",
    capacity_kg: (f) => f.capacity_kg || 0,
    mast_height_m: (f) => f.mast_height_m || 0,
    fuel_type: (f) => f.fuel_type || "",
    status: (f) => f.status,
    daily_rate: (f) => f.daily_rate || 0,
  },
});

const { page, setPage, totalPages, paginatedItems } = usePagination(sortedItems);

// En el tableHeader:
<TableRow>
  <SortableTableHead sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>
    ID
  </SortableTableHead>
  <SortableTableHead sortKey="model" ...>Modelo</SortableTableHead>
  ...
</TableRow>
```

### Detalles tecnicos

- El componente `SortableTableHead` usa iconos de lucide-react (`ArrowUp`, `ArrowDown`, `ArrowUpDown`)
- La comparacion automatica detecta tipo: si el valor es `number` compara numericamente, si es `string` usa `localeCompare`
- Los accessors permiten manejar campos anidados como `b.forklifts?.name` en BookingsPage
- El ordenamiento NO afecta la vista mobile (cards), solo la tabla desktop
- Al cambiar filtros o busqueda, el sort se mantiene activo
- Al cambiar de columna, la direccion se reinicia a ascendente
