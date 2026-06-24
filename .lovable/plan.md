## Estructura final del sidebar

```text
General
  · Panel
  · Calendario

Ventas                      ← colapsable, abre por defecto
  · CRM
  · Clientes
  · Cotizaciones
  · Contratos

Operaciones                 ← colapsable
  · Reservas
  · Entregas
  · Devoluciones

Compras                     ← colapsable
  · Proveedores
  · Facturas de Proveedor

Facturación y Finanzas      ← colapsable
  · Facturas
  · Flujo de Caja
  · Cuentas Bancarias
  · Conciliación Bancaria
  · Estado de Resultados

Flota
  · Equipos
  · Mantenimiento
  · Daños
  · Refacciones

Análisis
  · Reportes
  · MRR / Métricas

Comunidad
  · Mis Reportes
  · Tabla de Honor
  · Gestión de Feedback

Sistema
  · Usuarios
  · Configuración
  · Actividad
  · Bitácora
  · Changelog
  · Ayuda
```

**Movimientos clave**
- `Ventas` queda solo con el ciclo pre-operativo: CRM, Clientes, Cotizaciones, Contratos.
- `Operaciones` agrupa el ciclo de cumplimiento: Reservas → Entregas → Devoluciones.
- `Compras` separa proveedores y sus facturas de "Finanzas".
- `Facturación y Finanzas` se queda con dinero entrando/saliendo y reportes contables.
- `Historial de Imports` sale del sidebar (subruta navegable desde Conciliación Bancaria).

## Cambios técnicos

1. **`src/layouts/sidebar/navConfig.ts`**
   - Extender `NavGroup` con `collapsible?: boolean`.
   - Reescribir `NAV_GROUPS` con los 9 grupos listados. Marcar `Ventas`, `Operaciones`, `Compras`, `Facturación y Finanzas` con `collapsible: true`.

2. **`src/layouts/sidebar/SidebarNavSection.tsx`**
   - Cuando `group.collapsible`, envolver `SidebarGroupContent` en `Collapsible`/`CollapsibleContent` con `SidebarGroupLabel` como `CollapsibleTrigger` + chevron animado.
   - `defaultOpen` = `true` si el `pathname` actual matchea alguna ruta del grupo (usar `useLocation`).
   - En modo `collapsed` (icon) del sidebar, render plano sin colapsable.

3. **`src/layouts/hooks/useVisibleNavGroups.ts`**
   - Verificar que el filtrado por permisos siga ok (estructura no cambia, solo contenido).

4. **Changelog v6.89.0 (minor)**
   - Entrada en `public/changelog.json` + `public/changelog/v6.89.0.json`.

## Notas

- No se cambian URLs ni rutas en `src/routes/routes.ts`.
- No toca `ALWAYS_VISIBLE_ROUTES`.
- `collapsible="icon"` del `<Sidebar>` sigue funcionando: los colapsables solo afectan modo expandido.
