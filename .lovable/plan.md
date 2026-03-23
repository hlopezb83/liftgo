

## Análisis de drill-down en la aplicación

### Estado actual

Páginas que **ya tienen** drill-down (navegan a detalle o abren panel lateral):
- **Flotilla** → navega a `/fleet/:id`
- **Reservas** → navega a `/bookings/:id`
- **Cotizaciones** → navega a `/quotes/:id`
- **Facturas** → navega a `/invoices/:id`
- **Contratos** → navega a `/contracts/:id`
- **Clientes** → navega a `/customers/:id`
- **Proveedores** → navega a `/suppliers/:id`
- **Entregas** → navega a `/deliveries/:id`
- **Inspecciones de Retorno** → navega a `/return-inspections/:id`
- **Mantenimiento** → `MaintenanceDetailSheet` (panel lateral)
- **Gastos Operativos** → `ExpenseDetailSheet` (panel lateral)
- **Daños** → expand inline con fotos
- **Auditoría** → expand inline con detalles del log
- **CRM** → tarjetas Kanban con diálogo de edición

### Páginas donde se puede implementar drill-down

**1. Inventario de Refacciones (`InventoryPage.tsx`)**
- Actualmente las filas no son clickeables; los botones de editar/eliminar están en cada fila.
- **Propuesta**: Panel lateral (`PartDetailSheet`) que muestre nombre, SKU, categoría, costo unitario, stock actual, nivel mínimo, proveedor, y acciones de editar/eliminar. Limpiar la columna de acciones de la tabla.

**2. CRM / Prospectos (`CRMPage.tsx`)**
- Las tarjetas del Kanban abren un diálogo de edición, pero no hay vista de detalle con información resumida antes de editar.
- **Propuesta**: Panel lateral (`ProspectDetailSheet`) al hacer clic en una tarjeta, mostrando datos de contacto, empresa, valor estimado, cotizaciones vinculadas, historial de etapas, y desde ahí las acciones de editar/eliminar.

**3. Seguimiento de Daños (`DamageTrackingPage.tsx`)**
- Tiene un expand inline básico con fotos, pero no un drill-down completo.
- **Propuesta**: Panel lateral (`DamageDetailSheet`) con toda la información del daño: montacargas, cliente, descripción completa, galería de fotos, costo estimado, estado, historial de cambios de estado, y acciones de editar estado/costo.

### Resumen de prioridad

| Página | Beneficio | Complejidad |
|---|---|---|
| Inventario de Refacciones | Alto — misma lógica que gastos, filas con acciones inline que ensucian la tabla | Baja |
| CRM Prospectos | Medio — mejora la experiencia del pipeline de ventas | Media |
| Daños | Medio — el expand inline es limitado para fotos y acciones | Media |

### Recomendación

Empezar por **Inventario de Refacciones** ya que es el caso más directo (mismo patrón que gastos operativos), seguido de **CRM** y **Daños** si deseas continuar.

