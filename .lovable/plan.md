

# Traducir toda la aplicación a Español Mexicano

## Resumen

Traducir todos los textos visibles de la interfaz del inglés al español mexicano. Esto incluye navegación, títulos de página, etiquetas de formularios, botones, mensajes de estado, placeholders, toasts, y textos de ayuda en aproximadamente 40 archivos.

## Alcance

La traducción se hará de forma directa (hardcoded strings), sin implementar un sistema i18n, ya que la app está destinada a usuarios mexicanos y no necesita soporte multi-idioma.

## Archivos a Modificar

### Navegación y Layout

| Archivo | Cambios |
|---------|---------|
| `src/components/AppSidebar.tsx` | Traducir títulos de menú: Dashboard -> Panel, Fleet -> Flota, Calendar -> Calendario, Bookings -> Reservas, Quotes -> Cotizaciones, Contracts -> Contratos, Returns -> Devoluciones, Deliveries -> Entregas, Customers -> Clientes, Invoices -> Facturas, Maintenance -> Mantenimiento, Damage Tracking -> Seguimiento de Daños, Activity -> Actividad, Audit Trail -> Bitácora, Reports -> Reportes, Operations Setup -> Configuración, User Management -> Gestión de Usuarios. Cambiar "Navigation" -> "Navegación" |
| `src/layouts/CustomerPortalLayout.tsx` | Traducir textos del portal del cliente |
| `index.html` | Ya dice "Lift Go ERP" -- sin cambios |

### Páginas Principales

| Archivo | Textos a traducir |
|---------|-------------------|
| `src/pages/Dashboard.tsx` | "Dashboard" -> "Panel", "Fleet overview at a glance" -> "Vista general de la flota", "Add Forklift" -> "Agregar Montacargas", stat labels: "Total Fleet" -> "Flota Total", "Available" -> "Disponibles", "Rented" -> "Rentados", "In Maintenance" -> "En Mantenimiento", "Outstanding" -> "Pendiente", pie chart labels |
| `src/pages/Fleet.tsx` | "Fleet Inventory" -> "Inventario de Flota", table headers, search placeholder, filter labels, "Export CSV" -> "Exportar CSV", "Add Forklift" -> "Agregar Montacargas" |
| `src/pages/CalendarPage.tsx` | "Availability Calendar" -> "Calendario de Disponibilidad", "Bookings ending soon" -> "Reservas por vencer", filter tabs, booking list labels |
| `src/pages/BookingForm.tsx` | "New Booking" -> "Nueva Reserva", "Booking Details" -> "Detalles de Reserva", "Booking Dates" -> "Fechas de Reserva", "Enable Recurring Billing" -> "Habilitar Facturación Recurrente", "Create Booking" -> "Crear Reserva" |
| `src/pages/CustomersPage.tsx` | "Customers" -> "Clientes", form labels, section headers, dialog titles, button labels |
| `src/pages/InvoicesPage.tsx` | "Invoices" -> "Facturas", "Manage billing and track payments" -> "Administrar facturación y pagos", table headers, "New Invoice" -> "Nueva Factura" |
| `src/pages/ContractsPage.tsx` | "Contracts" -> "Contratos", "Manage rental agreements" -> "Administrar contratos de renta", table headers |
| `src/pages/DeliveriesPage.tsx` | "Deliveries & Pickups" -> "Entregas y Recolecciones", form labels, "Schedule" -> "Programar", "Schedule Transport" -> "Programar Transporte" |
| `src/pages/MaintenancePage.tsx` | "Maintenance" -> "Mantenimiento", "Log Service" -> "Registrar Servicio", form labels, table headers |
| `src/pages/DamageTrackingPage.tsx` | "Damage Tracking" -> "Seguimiento de Daños", table headers |
| `src/pages/ReturnInspectionPage.tsx` | "Returns & Check-in" -> "Devoluciones y Revisión", form labels |
| `src/pages/QuotesPage.tsx` | "Quotations" -> "Cotizaciones", "New Quote" -> "Nueva Cotización" |
| `src/pages/ActivityPage.tsx` | "Activity Feed" -> "Actividad Reciente", "Recent events across the system" -> "Eventos recientes del sistema" |
| `src/pages/AuditTrailPage.tsx` | "Audit Trail" -> "Bitácora de Cambios", table headers, filter labels |
| `src/pages/ReportsPage.tsx` | "Reports & Analytics" -> "Reportes y Análisis", report type labels |
| `src/pages/UserManagementPage.tsx` | "User Management" -> "Gestión de Usuarios", "Invite User" -> "Invitar Usuario", dialog labels |
| `src/pages/ForkliftForm.tsx` | "Add Forklift" -> "Agregar Montacargas", "Edit Forklift" -> "Editar Montacargas", all field labels |
| `src/pages/ForkliftDetail.tsx` | "Specifications" -> "Especificaciones", "Rental Rates" -> "Tarifas de Renta", "Change Status" -> "Cambiar Estado", all section titles |
| `src/pages/OperationsSetupPage.tsx` | Tab labels: "Equipment Models" -> "Modelos de Equipo", "Drivers" -> "Operadores", "Mechanics" -> "Mecánicos", form labels, dialog labels |
| `src/pages/NotFound.tsx` | "Page not found" -> "Página no encontrada", "Return to Home" -> "Volver al Inicio" |
| `src/pages/AuthPage.tsx` | "Sign In" -> "Iniciar Sesión", "Create Account" -> "Crear Cuenta", "Reset Password" -> "Restablecer Contraseña", "Are you a customer?" -> "¿Eres cliente?" |

### Portal del Cliente

| Archivo | Textos |
|---------|--------|
| `src/pages/portal/PortalLogin.tsx` | "Customer Portal" -> "Portal de Clientes", "Sign in to access your rentals..." -> "Inicia sesión para acceder a tus rentas...", "Staff member?" -> "¿Eres empleado?" |
| `src/pages/portal/PortalDashboard.tsx` | Portal dashboard labels |
| `src/pages/portal/PortalInvoices.tsx` | Portal invoice labels |
| `src/pages/portal/PortalContracts.tsx` | Portal contract labels |
| `src/pages/portal/PortalRentals.tsx` | Portal rental labels |

### Componentes Compartidos

| Archivo | Textos |
|---------|--------|
| `src/components/StatusBadge.tsx` | Todas las etiquetas de estado: "Available" -> "Disponible", "Rented" -> "Rentado", "Maintenance" -> "Mantenimiento", "Retired" -> "Retirado", "Draft" -> "Borrador", "Sent" -> "Enviado", "Paid" -> "Pagado", "Overdue" -> "Vencido", "Confirmed" -> "Confirmado", etc. |
| `src/components/BookingActions.tsx` | "Extend" -> "Extender", "Early Return" -> "Devolución Anticipada", "Cancel" -> "Cancelar", dialog messages |
| `src/components/CustomerSelector.tsx` | "Customer" -> "Cliente", "Existing Customer" -> "Cliente Existente", field labels |
| `src/components/FormActions.tsx` | "Cancel" -> "Cancelar" |
| `src/components/NotesCard.tsx` | "Notes" -> "Notas" |
| `src/components/EmptyRow.tsx` | "No results found" -> "Sin resultados" |
| `src/components/DocumentAttachments.tsx` | Document-related labels |
| `src/components/PostBookingDeliveryDialog.tsx` | Post-booking dialog labels |
| `src/components/PostDeliveryPickupDialog.tsx` | Post-delivery dialog labels |
| `src/components/PostInspectionInvoiceDialog.tsx` | Post-inspection dialog labels |
| `src/components/RecordPaymentDialog.tsx` | Payment dialog labels |
| `src/components/MarkAvailableDialog.tsx` | Mark available dialog labels |

### Dashboard Components

| Archivo | Textos |
|---------|--------|
| `src/components/dashboard/AlertsRow.tsx` | "Overdue Invoices" -> "Facturas Vencidas", "Service Due" -> "Servicio Pendiente", "Mark Paid" -> "Marcar Pagada", "Log Service" -> "Registrar Servicio" |
| `src/components/dashboard/FleetStatusChart.tsx` | "Fleet Status" -> "Estado de la Flota" |
| `src/components/dashboard/InvoiceBreakdown.tsx` | "Invoice Breakdown" -> "Desglose de Facturas", "View All" -> "Ver Todas", "Total Outstanding" -> "Total Pendiente" |
| `src/components/dashboard/UtilizationCharts.tsx` | "Fleet Utilization" -> "Utilización de Flota", "Revenue per Unit" -> "Ingresos por Unidad" |
| `src/components/dashboard/CashFlowChart.tsx` | "Cash Flow" -> "Flujo de Efectivo", "Invoiced" -> "Facturado", "Paid" -> "Pagado" |
| `src/components/dashboard/RecentActivity.tsx` | "Recent Activity" -> "Actividad Reciente" |

### Report Components

| Archivo | Textos |
|---------|--------|
| `src/components/reports/UtilizationReport.tsx` | "Fleet Utilization" -> "Utilización de Flota", table headers |
| `src/components/reports/RevenueReport.tsx` | "Revenue" -> "Ingresos", table headers |
| `src/components/reports/MaintenanceCostReport.tsx` | "Maintenance Costs by Unit" -> "Costos de Mantenimiento por Unidad", table headers |

### Constantes

| Archivo | Textos |
|---------|--------|
| `src/lib/constants.ts` | No se modifican los valores de las constantes ya que son usados como claves de la base de datos. Las traducciones se manejan en `StatusBadge.tsx` |

## Notas Técnicas

- Los valores almacenados en la base de datos (como estados: "available", "confirmed", etc.) se mantienen en inglés para no romper la lógica existente
- Solo se traducen las etiquetas visibles al usuario (labels/display text)
- Los placeholders de formularios se traducen a español mexicano coloquial-profesional
- Se usa "Montacargas" consistentemente en lugar de "Forklift"
- Se usa "$" para moneda (ya configurado en formatCurrency)
- No se requieren cambios en la base de datos ni en funciones backend
- Los archivos de la carpeta `src/components/ui/` no necesitan traducción (son componentes primitivos sin texto de negocio)

## Orden de implementación

Se modificarán todos los archivos en paralelo para minimizar el tiempo de implementación. Se priorizará:

1. Componentes compartidos (StatusBadge, FormActions, EmptyRow, etc.) ya que afectan toda la app
2. Navegación (AppSidebar)
3. Páginas principales
4. Dashboard components
5. Report components
6. Portal del cliente

