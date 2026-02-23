
# Mejoras de Responsividad Mobile

## Problemas Detectados

Despues de revisar la app en viewports de 390px (mobile), 768px (tablet) y desktop, se encontraron los siguientes problemas:

### 1. PageHeader se desborda en mobile
El componente `PageHeader` usa `flex items-center justify-between` sin wrapping. En mobile, los botones de accion (como "Agregar Montacargas", "Exportar CSV + Agregar Cliente") se recortan o salen de pantalla.

### 2. Tablas sin vista mobile en 6 paginas
Solo 3 paginas (Fleet, Invoices, Contracts) tienen vistas de cards para mobile. Las siguientes 6 muestran tablas con scroll horizontal en mobile:
- **QuotesPage** - tabla con 6 columnas
- **DeliveriesPage** - tabla con 7 columnas
- **CustomersPage** - tabla con 5+ columnas
- **MaintenancePage** - tabla con columnas
- **ReturnInspectionPage** - tabla con columnas
- **UserManagementPage** - tabla con 4 columnas

### 3. Tabs de status se desbordan
En InvoicesPage (6 tabs) y ContractsPage (5 tabs), los tabs hacen wrap a 2 lineas en mobile, se ve desordenado.

### 4. Filtros no se apilan en mobile
La fila de busqueda + select (ej. QuotesPage) se muestra lado a lado y queda apretada en pantallas pequenas.

## Plan de Implementacion

### Paso 1: Arreglar PageHeader para mobile
Hacer que el header haga wrap en mobile: cambiar de `flex items-center justify-between` a `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`. Esto apilara titulo arriba y botones abajo en mobile.

### Paso 2: Convertir tabs de status a ScrollArea horizontal
Envolver los `Tabs` de status en InvoicesPage y ContractsPage en un contenedor con scroll horizontal en mobile para que no hagan wrap.

### Paso 3: Apilar filtros en mobile
En QuotesPage y paginas similares, cambiar la fila de filtros de `flex gap-3` a `flex flex-col sm:flex-row gap-3` para que busqueda y select se apilen verticalmente en mobile.

### Paso 4: Agregar vista mobile de cards a QuotesPage
Usar el patron existente de `useIsMobile` + `customContent` en `ListPageLayout`. Crear cards con: numero de cotizacion, cliente, total y status badge.

### Paso 5: Agregar vista mobile de cards a CustomersPage
Cards con: nombre, RFC, telefono. Click navega al detalle.

### Paso 6: Agregar vista mobile de cards a DeliveriesPage
Cards con: fecha, tipo (entrega/recoleccion), montacargas, status, boton de completar.

### Paso 7: Agregar vista mobile de cards a MaintenancePage
Cards con: fecha, montacargas, tipo, costo, status.

### Paso 8: Agregar vista mobile de cards a ReturnInspectionPage
Cards con: fecha, montacargas, cliente, condicion.

### Paso 9: Agregar vista mobile de cards a UserManagementPage
Cards con: nombre, rol (select inline), botones de editar/eliminar.

## Detalles Tecnicos

Patron de card mobile utilizado (ya probado en Fleet/Invoices/Contracts):

```text
const isMobile = useIsMobile();

const mobileContent = isMobile ? (
  <div className="space-y-3 px-1">
    {paginatedItems.map((item) => (
      <Card key={item.id} className="cursor-pointer" onClick={() => navigate(...)}>
        <CardContent className="p-4">
          {/* Contenido resumido del item */}
        </CardContent>
      </Card>
    ))}
  </div>
) : null;

// Se pasa como prop:
<ListPageLayout customContent={mobileContent} ... />
```

**Archivos a modificar:**
- `src/components/PageHeader.tsx` - wrap responsive
- `src/pages/InvoicesPage.tsx` - tabs scroll
- `src/pages/ContractsPage.tsx` - tabs scroll
- `src/pages/QuotesPage.tsx` - filtros + cards mobile
- `src/pages/CustomersPage.tsx` - cards mobile
- `src/pages/DeliveriesPage.tsx` - cards mobile
- `src/pages/MaintenancePage.tsx` - cards mobile
- `src/pages/ReturnInspectionPage.tsx` - cards mobile
- `src/pages/UserManagementPage.tsx` - cards mobile

**Riesgo:** Bajo. Se usa el mismo patron ya probado en 3 paginas. El cambio en `PageHeader` es minimo y afecta todas las paginas positivamente.
