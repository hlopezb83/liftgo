

## Aplicar MobileCardList en 7 paginas

Reemplazar los bloques `mobileContent` manuales (condicional `isMobile ? (...) : undefined`) por el componente generico `MobileCardList` que ya existe. Cada pagina se simplifica eliminando ~15-20 lineas de scaffolding duplicado.

### Cambios por archivo

**1. Fleet.tsx** (lineas 53-81)
- Reemplazar el bloque `mobileContent` por `MobileCardList` con `keyExtractor={(f) => f.id}` 
- Mover solo el contenido interno de cada Card a `renderCard`
- Mover el `TablePagination` fuera (ya lo maneja `ListPageLayout`)
- Eliminar import de `Card, CardContent` si ya no se usa directamente (se sigue usando en renderCard)

**2. BookingsPage.tsx** (lineas 41-66)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(b) => b.id}`
- `emptyMessage="No se encontraron reservas"`

**3. InvoicesPage.tsx** (lineas 57-83)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(inv) => inv.id}`
- `emptyMessage="No se encontraron facturas"`

**4. CustomersPage.tsx** (lineas 50-70)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(c) => c.id}`
- `emptyMessage="No se encontraron clientes"`

**5. MaintenancePage.tsx** (lineas 67-88)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(log) => log.id}`
- `emptyMessage="No se encontraron registros"`

**6. DeliveriesPage.tsx** (lineas 57-83)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(d) => d.id}`
- `emptyMessage="No hay entregas programadas"`

**7. ReturnInspectionPage.tsx** (lineas 57-80)
- Reemplazar bloque `mobileContent` por `MobileCardList`
- `keyExtractor={(ins) => ins.id}`
- `emptyMessage="No hay inspecciones de devolucion"`

### Patron de cambio (ejemplo con Fleet)

Antes:
```text
const mobileContent = isMobile ? (
  <div className="space-y-3">
    {paginatedItems.length > 0 ? paginatedItems.map((f) => (
      <Card key={f.id}>...</Card>
    )) : (
      <Card>...empty...</Card>
    )}
  </div>
) : undefined;
```

Despues:
```text
const mobileContent = isMobile ? (
  <MobileCardList
    items={paginatedItems}
    keyExtractor={(f) => f.id}
    emptyMessage="No se encontraron montacargas"
    renderCard={(f) => (
      <Card onClick={...}>...</Card>
    )}
  />
) : undefined;
```

### Impacto
- Se eliminan ~15 lineas de logica duplicada por pagina (condicional length, wrapper div, empty state)
- El componente `MobileCardList` ya maneja el empty state y el spacing
- No hay cambios visuales ni funcionales -- solo consolidacion estructural
- Se agrega `import { MobileCardList }` en cada archivo

