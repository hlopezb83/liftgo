## Reorganización del sidebar

Aplico las instrucciones tal cual (2 archivos, 0 rutas/permisos/tests tocados).

### Analogía

Estamos re-acomodando el menú del restaurante: los platos más pedidos al frente y sin puertas, los de temporada agrupados con nombre claro, y que la cocina recuerde qué gavetas dejaste abiertas ayer.

## Cambios

### 1. `src/layouts/sidebar/navConfig.ts`
- Agregar `defaultOpen?: boolean` al tipo `NavGroup`.
- Reemplazar `NAV_GROUPS` con la estructura de 10 grupos en el nuevo orden:
  1. **General** (Panel, Calendario)
  2. **Operación diaria** — nuevo, sin colapsar (Reservas, Entregas, Devoluciones)
  3. **Ventas** (colapsable, `defaultOpen: true`)
  4. **Flota**
  5. **Dinero** (renombrado de "Facturación y Finanzas"; "Conciliación" → "Conciliación de Pagos")
  6. **Compras**
  7. **Análisis**
  8. **Auditoría** — nuevo grupo (Actividad, Bitácora)
  9. **Administración** (renombrado de "Sistema"; sólo Usuarios + Configuración)
  10. **Soporte** (colapsable, `defaultOpen: false`; consolida Ayuda, Changelog, Mis Reportes, Tabla de Honor, Gestión de Feedback)
- `ALWAYS_VISIBLE_ROUTES` **sin cambios**.

### 2. `src/layouts/sidebar/SidebarNavSection.tsx`
- Añadir `NAV_GROUPS_STORAGE_KEY` + helpers `readNavGroupState` / `writeNavGroupState` con try/catch (modo privado, storage lleno).
- Cambiar el estado inicial: `persisted ?? group.defaultOpen ?? hasActive`.
- Nuevo `handleOpenChange` persiste en localStorage y se conecta al `Collapsible`.
- Comportamiento `open || hasActive` intacto (navegar a `/invoices` abre "Dinero" aunque el usuario lo tuviera colapsado).

### 3. Changelog + versión
- `v7.234.0` (minor): reorganización de navegación, no cambios de comportamiento.
- Entrada en `public/changelog.json` + detalle en `public/changelog/v7.234.0.json`.
- Bump `package.json`.

## Verificación

- `tsgo --noEmit` verde (el campo opcional no rompe otros usos).
- Verificación manual: recargar tras colapsar "Ventas" → sigue colapsado; navegar a `/invoices` → "Dinero" se auto-abre.
- Los tests actuales no referencian labels de nav; matriz de roles (`roleMatrix.test.ts`) usa módulos de permisos, no cambia.

## Fuera de alcance (para después, si se aprueba)

- Fase 2 opcional: badges de conteo (OTs pendientes, intents por revisar, entregas de hoy) y botón "+ Nuevo" arriba del nav.
