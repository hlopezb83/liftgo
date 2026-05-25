
# Pulido móvil y tablet — LiftGo

## Contexto

La app es **desktop-first 99%** (Core memory) y ese principio se mantiene: no se rediseña el desktop. Pero un usuario completó una cotización desde celular, así que vale la pena pulir los flujos críticos en pantallas chicas sin tocar la densidad del escritorio.

El header global ya es compacto (`h-12`), `MobileCardList` ya está estandarizado en módulos primarios y `useIsMobile` (<768px) está disponible. Lo que falta es **pulido fino**, no rediseño.

---

## Diagnóstico (lo que un usuario móvil siente "sin pulir")

1. **Targets táctiles chicos** — botones `size="sm"` y `h-8` están por todos lados (header, acciones de lista, FAB Reportar). Apple/Material recomiendan ≥44px. En móvil se ven "apretados" y se erra el tap.
2. **Sidebar al abrir tapa todo** — en móvil el `SidebarTrigger` abre el sheet pero no hay backdrop visual claro ni cierre por swipe.
3. **Diálogos full-bleed faltantes** — `Dialog` usa `sm:max-w-md/lg` pero en <640px ocupa casi toda la pantalla con padding fijo; formularios largos (Cotización, Cliente, Booking) hacen scroll interno raro y los `DialogFooter` flotan sin sticky.
4. **Inputs sin optimización móvil** — faltan `inputMode="numeric|decimal|email|tel"` y `autoComplete` en formularios; el teclado iOS hace zoom porque varios inputs no llegan a 16px de font-size.
5. **Tablas que sí aparecen en tablet (768–1024px)** — entre `md` y `lg` las tablas zebra densas se sienten apretadas; no hay un breakpoint intermedio que use cards o scroll horizontal con sombra de borde.
6. **PageHeader desperdicia espacio** — en móvil título + subtítulo + acciones se apilan sin jerarquía; el botón "Nueva" debería ser sticky o FAB en móvil.
7. **Filtros en `ListPageLayout`** — el `SearchBar` + `Select` apilados ocupan 2 filas; en móvil debería colapsar a un botón "Filtros" con sheet.
8. **Toasts (`sonner`)** — por defecto aparecen abajo-derecha, en móvil chocan con el FAB Reportar y el área del pulgar.
9. **Formularios largos sin progreso** — Cotización/Booking forms no muestran secciones colapsables en móvil; el usuario hace scroll ciego.
10. **Detalle de cotización** — `DetailPageHeader` con acciones (PDF, enviar, convertir) se aprieta; conviene menú "…" en móvil.
11. **Gestos faltantes** — no hay pull-to-refresh en listas, ni swipe en cards de `MobileCardList` para acciones rápidas.
12. **Safe areas iOS** — falta `env(safe-area-inset-*)` para notch y home indicator; el FAB y header pueden quedar tapados.

---

## Propuesta de cambios (fases, todo presentación/frontend)

### Fase 1 — Fundamentos (alto impacto, bajo riesgo)

- **A. Safe areas iOS**
  - `index.html`: `viewport-fit=cover` en meta viewport.
  - `MainLayout`: padding-top/bottom con `env(safe-area-inset-*)` en header y main.
- **B. Targets táctiles ≥44px en móvil**
  - Variante responsive: `size="sm"` → en <768px aplicar `min-h-11 min-w-11` vía clase utilitaria nueva en `tailwind.config.ts` (`touch:`).
  - Aplicar a botones de header (`FeedbackFab`, `SidebarTrigger`, `GlobalSearch`) y acciones de fila.
- **C. Inputs móvil-friendly**
  - Auditar inputs de Cotización, Cliente, Booking y agregar `inputMode`, `autoComplete`, `enterKeyHint`.
  - Forzar `text-base` (16px) en inputs en móvil para evitar zoom iOS.
- **D. Toasts reposicionados**
  - `sonner` con `position="top-center"` en móvil (vía `useIsMobile`) para no chocar con FAB ni el área del pulgar.

### Fase 2 — Diálogos y formularios

- **E. DialogContent responsive estándar**
  - Patrón base: `max-w-lg max-h-[90dvh] flex flex-col` con header/footer `shrink-0` y body `flex-1 min-h-0 overflow-y-auto` (ya aplicado en FeedbackFormDialog en v6.7.7 — extender a Cotización, Booking, Cliente, Inventario, Mantenimiento).
  - Usar `100dvh` en lugar de `100vh` para Safari móvil.
- **F. Footer sticky en formularios largos**
  - En `BookingForm`, `QuoteForm`, `ContractForm`: barra de acciones sticky-bottom en móvil con sombra superior.
- **G. Secciones colapsables en forms largos (móvil)**
  - Cotización: agrupar (Cliente, Equipos, Términos, Notas) en `Accordion` solo en móvil; en desktop sigue stacked.

### Fase 3 — Listas y navegación

- **H. Filtros móviles en sheet**
  - `ListPageLayout`: en móvil colapsa filtros en botón "Filtros" + `Sheet` lateral con badge de filtros activos.
- **I. PageHeader compacto móvil**
  - Título + acción primaria en una sola fila; subtítulo más chico o oculto bajo "i".
- **J. FAB de acción primaria**
  - En módulos clave (Cotizaciones, Bookings, Clientes): mover "Nueva +" a FAB flotante en móvil (esquina inferior derecha, encima del FAB Reportar — coordinar z-index y posición).
- **K. Tablet sweet-spot (768–1024px)**
  - Forzar `MobileCardList` hasta `lg` (1024px) en módulos donde la tabla se aprieta (Cotizaciones, Bookings, Inventario). Hoy el switch es a 768px.
  - Alternativa: tabla con scroll horizontal + columna sticky para ID.

### Fase 4 — Detalle y gestos (opcional, mayor esfuerzo)

- **L. Acciones de detalle en menú "…"**
  - `DetailPageHeader`: en móvil colapsar todas las acciones secundarias en `DropdownMenu`; dejar solo la primaria visible.
- **M. Swipe en cards (`MobileCardList`)**
  - Swipe-left para acción rápida (editar/cancelar/PDF) en cotizaciones y bookings.
- **N. Pull-to-refresh**
  - En listas principales, gesto nativo que invalida la query de TanStack Query.

---

## Detalles técnicos

- **Sin cambios en lógica de negocio, RPCs, schema, edge functions ni RLS.**
- Nuevo hook utilitario `useViewport` que extiende `useIsMobile` con breakpoint `tablet` (768–1023).
- Token Tailwind nuevo: variante `touch:` que aplica solo cuando `(hover: none) and (pointer: coarse)`.
- Patrón documentado en `architecture.md` para que futuros diálogos/listas lo sigan.
- Tests: agregar snapshot de `useViewport` y un par de tests de render condicional en `ListPageLayout`.
- Actualizar `public/changelog.json` + entradas detalle por cada fase publicada (semver minor por fase).

---

## Qué quiero confirmar antes de implementar

Esto es bastante terreno. Sugiero arrancar por **Fase 1 + Fase 2** (fundamentos + diálogos) que dan ~70% del "pulido percibido" con bajo riesgo, y dejar Fases 3 y 4 para iteraciones siguientes.

¿Te parece arrancar así o prefieres otro recorte (p. ej., solo el flujo de Cotización end-to-end en móvil)?
