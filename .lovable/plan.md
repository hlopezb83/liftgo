# Auditoría UI/UX a 1920×1080 — LiftGo

Revisé 13 vistas en escritorio Full HD. Las clasificaciones: **CRÍTICO** (rompe percepción de sistema o función), **ALTO** (incoherencia visible inmediata), **MEDIO** (pulido), **OK** (sin acción). Solo listo lo accionable.

---

## 1) Bugs visuales y de acomodo

### CRÍTICO — `/company-settings` renderiza 404 con breadcrumb "Datos Fiscales"
La ruta sigue activa en sidebar pero el lazy route devuelve `NotFound`. Probable mismatch entre `ROUTES.companySettings` y el `path` registrado en `App.tsx`/routing. Reproducible en cualquier sesión.
**Fix:** validar `path="/company-settings"` en la definición de rutas; si la ruta correcta es otra (`/configuracion`, etc.), redirigir.

### ALTO — Inventario de flota: nombre de página no coincide con sidebar
Sidebar dice **"Equipos"** → la página dice **"Inventario de Flota"** y breadcrumb dice **"Equipos"**. Tres etiquetas para el mismo módulo confunden la jerarquía.
**Fix:** unificar a "Equipos" en `<PageHeader title="Equipos" subtitle="58 unidades en flota" />`.

### ALTO — Sidebar: marca recortada agresivamente
"HERREN ENERGY SA D..." y email "hlopezb@gm..." quedan cortados aun teniendo el sidebar expandido a su ancho normal en 1920px. Se siente apretado vs el espacio disponible (~210px).
**Fix:** subir el ancho del sidebar a `--sidebar-width: 16rem` (256px) o agregar `title` tooltip + `min-w-0 truncate` con dos líneas permitidas para la razón social.

### ALTO — Estado de Resultados: ícono de Utilidad Neta no cambia con valor negativo
La KPI muestra `-$445,534.77` con ícono de tendencia neutra azul. Otras vistas (Cartera Vencida) sí refuerzan con color destructivo.
**Fix:** condicionar `iconBg`/`iconColor` según signo; mantener semáforo (positivo `success`, negativo `destructive`).

### MEDIO — Header columna "Vencido $44,225.00" en CXP repite el mismo número que "Pendiente total"
Visualmente parece duplicado. Aunque el dato es real, falta separación o subtítulo aclarando que vencido es subconjunto del pendiente.
**Fix:** badge debajo del valor: `de los $44,225.00 pendientes` o usar texto secundario.

### MEDIO — Card "Facturas Vencidas (5)" en Panel desborda colores
El fondo rojo claro y la línea de íconos verdes a la derecha (estado check) compiten visualmente; el check verde junto a una factura vencida sugiere "pagada".
**Fix:** cambiar el ícono de acción a `ChevronRight` o `Eye` (neutral) en lugar de check verde.

---

## 2) Sistema de espaciado

### ALTO — Padding horizontal de página inconsistente
- Panel, Facturas, Reservas, Clientes, Equipos: `px-6` (~24px) desde el header al borde.
- Mantenimiento, Datos Fiscales (404), Estado de Resultados, CRM: arrancan pegados al borde izquierdo del área de contenido (`px-0` o `px-4`).
**Fix:** envolver toda página en `<PageLayout>` con `px-6 py-6` fijo. O introducir clase utilitaria `.page-container` en `index.css`.

### MEDIO — Gap entre KPI cards varía
Panel usa `gap-4` (16px) en su grid de 5 cards. Estado de Resultados usa `gap-6` (24px). Calendario usa `gap-4`. Definir un único valor.
**Fix:** estandarizar `gap-4` para grids de KPIs.

### MEDIO — Subtítulo bajo el título: separación distinta
- Panel: `"Vista general de la flota"` con `mt-1`.
- Facturas: `"Administrar facturación y pagos"` con `mt-2`.
- CRM: subtítulo es realmente un meta `"18 prospectos · $6,182,099.36"` sin descripción.
**Fix:** componente `<PageHeader title subtitle meta?>` que separe descripción (frase) de meta (contador).

### MEDIO — Filtros: posición y composición distintas
| Página | Patrón |
|---|---|
| Facturas | tabs izq + buscador der + date filter der |
| Cotizaciones | buscador izq + dropdown der |
| Reservas | tabs izq + buscador der |
| Clientes | buscador centrado solo |
| CXP | buscador + 6 dropdowns en una sola fila |
| Equipos | buscador izq + dropdown der |

**Fix:** definir un `<ListToolbar>` con slots `tabs / search / filters / actions`. Toda lista usa el mismo componente.

---

## 3) Armonía tipográfica y color

### ALTO — Tres tamaños distintos para el título de página
- Panel/Facturas/Cotizaciones/Reservas/Clientes: `text-3xl font-bold` (30px).
- CRM: `text-2xl font-bold` (24px) — más chico.
- Mantenimiento: `text-3xl` pero con `font-semibold` (no bold).

**Fix:** clase utilitaria `.page-title` = `text-3xl font-bold tracking-tight` aplicada vía `<PageHeader>`.

### ALTO — Color del subtítulo varía
Algunos usan `text-muted-foreground`, otros `text-gray-500`, otros `text-sm text-slate-600`. Todos deben ser `text-muted-foreground text-sm`.
**Fix:** búsqueda + reemplazo: `text-(slate|gray|zinc)-(400|500|600)` → `text-muted-foreground`.

### MEDIO — Iconos de KPI cards: paleta inconsistente
- Panel: pasteles armonizados (`bg-emerald-50` + `text-emerald-600`, etc.).
- Estado de Resultados: usa `bg-emerald-500`, `bg-rose-500`, `bg-blue-500` saturados (mismas tonalidades que badges de estado).
- Calendario: usa íconos sin contenedor circular.

**Fix:** sistema de "KpiCard" único con `tone: success|warning|danger|info|neutral` que mapee a tokens semánticos (`--success`, etc.) con opacidad 10% para fondo y 100% para foreground.

### MEDIO — Mezcla de tokens y Tailwind hardcoded
`grep -rn "text-(red|green|blue|emerald|rose|amber|slate|gray|zinc)-(50|100|...|900)"` en `src/features/**/components/` arroja decenas de matches. Cada uno viola la convención de tokens semánticos del proyecto.
**Fix:** issue dedicado para migrar `bg-red-50/text-red-700` → `bg-destructive/10 text-destructive`, etc. Hacer barrido por carpeta.

---

## 4) Consistencia de componentes (UI Kit)

### ALTO — Botón primario: 3 anchos distintos en el mismo viewport
- `Nueva Factura` (Facturas): compacto, ícono `+` lucide pequeño.
- `Agregar Montacargas` (Equipos): más ancho, texto más largo, mismo estilo.
- `Nueva Cotización` (Cotizaciones): ancho intermedio.
- `Registrar Servicio` (Mantenimiento): ícono `PlusCircle` (relleno) en vez de `Plus` (delgado). Inconsistente.

**Fix:** unificar ícono leading a `<Plus className="h-4 w-4" />` y dejar el ancho fluido por contenido (sin `min-w`). Estandarizar verbo "Nuevo X" en lugar de mezclar "Agregar/Registrar/Crear/Nuevo".

### ALTO — Botón secundario: 2 variantes
- Facturas: `Generar Recurrentes` y `Exportar CSV` con borde + fondo blanco.
- CXP: `Antigüedad` y `Exportar pagos` mismo estilo.
- Calendario: toggles `Gantt/Lista/Semana/Mes` usan tabs con fondo activo claro pero los botones secundarios de otras vistas son outline.

**Fix:** auditar `<Button variant>`; cualquier botón con `border + bg-white` debe usar `variant="outline"`.

### MEDIO — Cards de KPI: dos diseños activos
Patrón A (Panel): ícono circular pastel + label + valor grande, `rounded-xl`, sombra suave.
Patrón B (Estado de Resultados): ícono cuadrado saturado + label + valor, `rounded-lg`, sin sombra.

**Fix:** consolidar en un único `<KpiCard>` (probablemente extender `src/components/feedback/StatusBadge` siblings).

### MEDIO — Badges de estado: misma intención, dos estilos
- Reservas: `Cancelado` filled rojo intenso; `Completado` filled gris oscuro.
- Facturas: `Vencido` filled rojo; `Pagado` filled verde; `Borrador` outline gris.
- CXP: `Vencida` filled rojo claro/oscuro; `Pagada` filled verde.

**Fix:** revisar `StatusBadge.tsx` para que todos los estados terminales (cancelado/completado/pagado/vencido) usen un mismo tratamiento (filled) y los borradores siempre outline.

### MEDIO — Tablas: anchos de columna fijos vs flex
Algunas tablas (Equipos, Facturas) recortan `Ubicación` con `truncate` invisible. Otras (Clientes) dejan crecer la columna y desperdician espacio derecho.
**Fix:** convención en `<DataTableV2>`: columnas de texto largo siempre `truncate` con tooltip; columnas de moneda `tabular-nums text-right`.

### MEDIO — Search input: dos altos
- `Ctrl+K` global en topbar: `h-8` (~32px).
- Search en listados: `h-10` (~40px).
**Fix:** topbar también `h-10` o ambos `h-9`.

---

## 5) Cohesión global

### Recomendación arquitectónica (ALTA prioridad)
La causa raíz de la mayoría de incoherencias es que **cada página construye su header y toolbar manualmente** en vez de consumir un componente compartido. El proyecto ya tiene `PageHeader.tsx`, `DetailPageHeader.tsx`, `FormPageHeader.tsx` pero solo algunas vistas los usan.

**Acción:** auditar páginas no migradas y forzar uso de:
- `<PageHeader title subtitle meta actions />` para listados.
- `<ListToolbar tabs search filters />` para barras de filtros.
- `<KpiCard tone label value icon />` para KPIs.

---

## Plan de implementación sugerido (cuando pase a build mode)

1. **Fix crítico routing** (`/company-settings` 404): 15 min.
2. **Unificar `PageHeader` + título** en las 13 vistas auditadas: ~1h.
3. **Eliminar colores Tailwind hardcoded** (`red-*`, `green-*`, etc.) → tokens semánticos: ~2h, requiere PR aparte.
4. **Consolidar `KpiCard`** y migrar Estado de Resultados + Calendario: ~45min.
5. **Estandarizar botones primarios/secundarios** + íconos `Plus`: ~30min.
6. **`ListToolbar` componente** + migración de 6 listados: ~1.5h.
7. **Subir `--sidebar-width` a 16rem** y agregar tooltip a marca: 10min.

Total estimado: ~6 horas de pulido para alcanzar cohesión visual completa.

¿Apruebas que ejecute todo el plan, o prefieres que arranque solo con los CRÍTICOS y ALTOS (puntos 1, 2, 4, 5, 7) y dejemos la migración masiva de tokens y `ListToolbar` para iteraciones posteriores?
