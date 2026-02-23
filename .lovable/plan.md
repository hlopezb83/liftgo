
# Plan de Refactorizacion — Fase 5: Reorganizar navegacion del sidebar

## Problema

Actualmente los 18 enlaces del sidebar estan en una sola lista plana bajo "Navegacion", sin agrupacion logica. Esto dificulta encontrar secciones rapidamente, especialmente porque mezcla operaciones diarias con configuracion administrativa.

## Propuesta de reorganizacion

Agrupar los enlaces en **4 secciones** que reflejan el flujo natural de un negocio de renta de montacargas:

### General
- Panel (Dashboard — vista general, siempre primero)
- Calendario (vista rapida de disponibilidad)

### Operaciones
Sigue el flujo cronologico de una renta: cotizar, reservar, firmar contrato, entregar, devolver, facturar.
- Clientes
- Cotizaciones
- Reservas
- Contratos
- Entregas
- Devoluciones
- Facturas

### Flota
Todo lo relacionado con los equipos fisicos:
- Flota (inventario)
- Mantenimiento
- Seguimiento de Danos

### Administracion
Herramientas de supervision y configuracion:
- Actividad
- Bitacora
- Reportes
- Configuracion
- Datos Fiscales
- Gestion de Usuarios

## Cambios tecnicos

Solo se modifica **un archivo**: `src/components/AppSidebar.tsx`

1. Cambiar la estructura de `navItems` de un arreglo plano a un arreglo de grupos, cada uno con `label` y `items[]`.
2. En el render, iterar sobre los grupos para generar un `SidebarGroup` con su `SidebarGroupLabel` por cada seccion.
3. La logica de filtrado por rol se mantiene igual. Si un grupo queda vacio (porque el usuario no tiene permisos), no se muestra.

```text
// Estructura propuesta
const navGroups = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: LayoutDashboard },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Cotizaciones", url: "/quotes", icon: FileText, roles: ["admin", "dispatcher"] },
      { title: "Reservas", url: "/bookings/new", icon: BookOpen, roles: ["admin", "dispatcher"] },
      { title: "Contratos", url: "/contracts", icon: ScrollText, roles: ["admin", "dispatcher"] },
      { title: "Entregas", url: "/deliveries", icon: TruckIcon, roles: ["admin", "dispatcher"] },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck, roles: ["admin", "dispatcher"] },
      { title: "Facturas", url: "/invoices", icon: Receipt, roles: ["admin", "dispatcher"] },
    ],
  },
  {
    label: "Flota",
    items: [
      { title: "Equipos", url: "/fleet", icon: Truck },
      { title: "Mantenimiento", url: "/maintenance", icon: Wrench },
      { title: "Daños", url: "/damage", icon: AlertTriangle },
    ],
  },
  {
    label: "Administración",
    items: [
      { title: "Actividad", url: "/activity", icon: Activity },
      { title: "Bitácora", url: "/audit", icon: History, roles: ["admin", "dispatcher"] },
      { title: "Reportes", url: "/reports", icon: BarChart3, roles: ["admin", "dispatcher"] },
      { title: "Configuración", url: "/settings/operations", icon: Settings, roles: ["admin"] },
      { title: "Datos Fiscales", url: "/settings/company", icon: Building2, roles: ["admin"] },
      { title: "Usuarios", url: "/users", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
];
```

Notas:
- "Flota" se renombra a "Equipos" para evitar confusion con la etiqueta del grupo.
- "Seguimiento de Danos" se acorta a "Danos" para mantener el sidebar limpio.
- "Gestion de Usuarios" se acorta a "Usuarios".
- No hay cambios en rutas ni en ningun otro archivo.
