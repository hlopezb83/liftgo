# Atajos de teclado globales (#8) — Cierre del plan original

Hoy existe `Ctrl+K` (búsqueda/navegación) en `src/layouts/GlobalSearch.tsx`. Vamos a expandirlo a un sistema completo de atajos productivos para usuarios de escritorio.

## Alcance

### 1. Hook central `useHotkeys`
- `src/hooks/useHotkeys.ts`: registra atajos con scope (`global`, `page`, `dialog`), respeta inputs (no dispara si el foco está en `input/textarea/contentEditable`, salvo atajos marcados `allowInInput`).
- Soporta combos (`mod+k`, `mod+shift+n`) y secuencias tipo Gmail (`g` luego `c` → ir a Clientes).
- Cleanup obligatorio (regla Power of 10).

### 2. Registro global de navegación (secuencias `g + letra`)
Se monta una vez en `MainLayout`:

```text
g d → Panel              g c → Clientes        g q → Cotizaciones
g b → Reservas           g f → Facturas        g e → Equipos
g m → Mantenimiento      g x → Gastos          g r → Reportes
g k → Calendario         g p → Proveedores     g a → CxP
```

### 3. Atajos globales con modificador
| Atajo | Acción |
|---|---|
| `Ctrl+K` | Paleta de comandos (ya existe) |
| `Ctrl+/` o `?` | Abrir panel de ayuda de atajos |
| `Ctrl+Shift+N` | Acción "nuevo" contextual a la página actual |
| `Ctrl+Shift+F` | Enfocar barra de búsqueda local de la página |
| `Esc` | Cerrar dialogo/panel activo (ya nativo en shadcn, validar) |

### 4. Atajos por página (contextuales)
Cada listado expone su acción "nuevo" vía un contexto ligero `PageActionsContext`:
- `N` → abre formulario nuevo (cotización, factura, cliente, reserva, etc.)
- `/` → enfoca búsqueda de la página
- `R` → refresca query principal

Páginas a instrumentar en esta entrega:
Clientes, Cotizaciones, Reservas, Facturas, Equipos, Mantenimiento, Proveedores, Gastos, CxP, CRM.

### 5. Panel de ayuda de atajos
`src/components/KeyboardShortcutsDialog.tsx`:
- Se abre con `?` o `Ctrl+/`, o desde un botón discreto en el header (icono teclado).
- Lista agrupada: Global · Navegación (`g + …`) · Página actual.
- Cada combo se renderiza con `<kbd>` estilizado consistente con el badge del Ctrl+K actual.

### 6. Integración visual
- En tablas de cabeceras de página, mostrar tooltip discreto `N` en el botón "Nuevo".
- Sin cambios de paleta ni rediseños.

## Cambios técnicos clave

- **Nuevo**: `src/hooks/useHotkeys.ts`, `src/contexts/PageActionsContext.tsx`, `src/components/KeyboardShortcutsDialog.tsx`, `src/lib/shortcuts/registry.ts` (catálogo central tipado para que el panel de ayuda y los handlers compartan fuente de verdad).
- **Editar**: `src/layouts/MainLayout.tsx` (monta provider + dialog + atajos navegación), `src/layouts/GlobalSearch.tsx` (consume registry para evitar duplicar definiciones), páginas listadas arriba (registrar acción "Nuevo" + búsqueda vía `usePageActions`).
- **Sin migraciones SQL.** Sin cambios de RLS. Sin dependencias nuevas (usamos listeners nativos; no añadimos `react-hotkeys-hook`).

## Fuera de alcance
- Personalización de atajos por usuario.
- Macros / multi-paso encadenadas.
- Atajos en vista móvil (sigue desktop-first).

## Cierre
Tras esta entrega marcamos #8 como ✅ y damos por cerrado el plan original. Pendientes restantes (#2 Mi Día, #5 acciones masivas, #6 Kanban cotizaciones, #10 link público, #13 mapa, #15 pago online, #16 PWA, #17 QR, #18 mantenimiento predictivo, #20 offline) pasan a backlog para un nuevo plan.

## Changelog
Versión **minor** `v6.35.0` — "Atajos de teclado globales": entrada en `public/changelog.json` + `public/changelog/v6.35.0.json` con detalle de combos y panel `?`.
