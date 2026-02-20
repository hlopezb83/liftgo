

# Correcciones de Textos en Ingles Restantes

## Resumen

La revision encontro varios textos en ingles que no fueron traducidos. Son pocos pero visibles para el usuario final.

## Hallazgos y Correcciones

### 1. Paginacion: "Previous" y "Next"
**Archivo:** `src/components/ui/pagination.tsx`
- Linea 52: `"Previous"` debe ser `"Anterior"`
- Linea 59: `"Next"` debe ser `"Siguiente"`
- Linea 50: aria-label `"Go to previous page"` a `"Ir a la pagina anterior"`
- Linea 58: aria-label `"Go to next page"` a `"Ir a la pagina siguiente"`
- Linea 68: sr-only `"More pages"` a `"Mas paginas"`

Esto afecta TODAS las tablas con paginacion en toda la app.

### 2. CustomersPage: Toasts y label en ingles
**Archivo:** `src/pages/CustomersPage.tsx`
- Linea 66: `"Name is required"` debe ser `"El nombre es requerido"`
- Linea 77: `"Customer updated"` debe ser `"Cliente actualizado"`
- Linea 79: `"Customer added"` debe ser `"Cliente agregado"`
- Linea 151: Label `"Tax / VAT ID"` debe ser `"ID Fiscal"`
- Linea 200: Label `"Website"` debe ser `"Sitio Web"`

### 3. InvoicesPage: Tabs de estado en ingles
**Archivo:** `src/pages/InvoicesPage.tsx`
- Linea 59: Los tabs muestran los valores crudos en ingles (`draft`, `sent`, `partial`, `paid`, `overdue`, `all`). Necesitan un mapa de etiquetas similar al de QuotesPage.

### 4. ContractsPage: Tabs de estado en ingles
**Archivo:** `src/pages/ContractsPage.tsx`
- Linea 51: Los tabs muestran los valores crudos (`draft`, `sent`, `signed`, `cancelled`, `all`). Necesitan un mapa de etiquetas.

### 5. Fleet, ForkliftForm, ForkliftDetail: Estados en ingles
**Archivos:** `src/pages/Fleet.tsx`, `src/pages/ForkliftForm.tsx`, `src/pages/ForkliftDetail.tsx`
- Los dropdowns de estado de montacargas usan `s.charAt(0).toUpperCase() + s.slice(1)` que simplemente capitaliza el valor en ingles (e.g., "Available", "Maintenance"). Necesitan un mapa de etiquetas en espanol.

### 6. CalendarPage: Estado en tooltip sin traducir
**Archivo:** `src/pages/CalendarPage.tsx`
- Linea 223: El tooltip del booking muestra `booking.status` en ingles con `capitalize`. Necesita traducirse usando el mismo mapa de StatusBadge.

## Detalles Tecnicos

**Mapa de estados de montacargas** (reutilizable):
```text
available -> Disponible
rented -> Rentado
maintenance -> Mantenimiento
retired -> Retirado
```

**Mapa de estados de facturas:**
```text
all -> Todas
draft -> Borrador
sent -> Enviada
partial -> Parcial
paid -> Pagada
overdue -> Vencida
```

**Mapa de estados de contratos:**
```text
all -> Todos
draft -> Borrador
sent -> Enviado
signed -> Firmado
cancelled -> Cancelado
```

| Accion | Archivo | Cambio |
|--------|---------|--------|
| Modificar | `src/components/ui/pagination.tsx` | "Previous"/"Next" a "Anterior"/"Siguiente" |
| Modificar | `src/pages/CustomersPage.tsx` | 5 textos en ingles |
| Modificar | `src/pages/InvoicesPage.tsx` | Tabs con mapa de etiquetas |
| Modificar | `src/pages/ContractsPage.tsx` | Tabs con mapa de etiquetas |
| Modificar | `src/pages/Fleet.tsx` | Dropdown con mapa de etiquetas |
| Modificar | `src/pages/ForkliftForm.tsx` | Dropdown con mapa de etiquetas |
| Modificar | `src/pages/ForkliftDetail.tsx` | Dropdown con mapa de etiquetas |
| Modificar | `src/pages/CalendarPage.tsx` | Tooltip status traducido |

