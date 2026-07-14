## Auditoría Sprint D (v7.66.0)

**Estado:** ✅ OK, sin bugs.

Verificado:
- `buttonVariants` extiende con `xs` (h-8, px-2.5, text-xs, [&_svg]:size-3.5) y `iconSm` (h-8 w-8, [&_svg]:size-3.5). Cambio 100% aditivo — no rompe llamadas existentes (`default` / `sm` / `lg` / `icon` intactos).
- 4 migraciones aplicadas correctamente (AuditTrailPage línea 118, AuditLogMobileCard línea 25, ImageGalleryLightbox líneas 57 y 60).
- Playwright verificó que la app arranca sin errores JS (solo el warning de locale ya conocido). Sidebar muestra `v7.66.0`.
- No hay `window.confirm` en código productivo. `useConfirm` centraliza 29 flujos destructivos.
- Los 9 archivos con `Dialog` primitivo son todos casos no-form legítimos.

**Tests:** `Button` es un CVA puro sin lógica de negocio; `buttonVariants` produce strings de CSS deterministas. No requiere tests unitarios dedicados — está cubierto indirectamente por cada componente que lo usa. Los 3 componentes migrados no cambian comportamiento, solo dimensión visual.

**Deuda residual:** ninguna crítica.

---

## Sprint E — General Polish (final del plan de auditoría UI/UX)

**Objetivo:** cerrar los cabos sueltos de tipografía, color y consistencia visual que quedaron dispersos tras Sprints A–D.

### Hallazgos

1. **Micro-tipografía hardcodeada (37 usos).** `text-[10px]`, `text-[11px]`, `text-[9px]` esparcidos en calendario, dashboard, sidebar, cash-flow, users, cfdi. No hay token oficial para tamaños sub-`text-xs` (que es 12px). Los desarrolladores improvisan en cada archivo → drift a 9/10/11px sin criterio.
2. **`bg-white` residual (2 usos legítimos):** `SidebarBranding` (contenedor del logo — el logo requiere fondo blanco para contraste) y `DeliverySignatureCard` (previsualización de firma — mimetiza papel). Ambos defendibles pero sin documentar. Deben etiquetarse como excepciones intencionales.
3. **Sin hex hardcoded, sin `rounded-[...]` fuera de primitives.** ✅ Excelente higiene general.

### Alcance (3 tareas)

**E1. Tokens de micro-tipografía**
- Agregar al `@theme inline` de `src/index.css`:
  - `--text-2xs: 0.6875rem` (11px) + `--text-2xs--line-height: 1rem`
  - `--text-3xs: 0.625rem` (10px) + `--text-3xs--line-height: 0.875rem`
- Esto expone las utilities `text-2xs` y `text-3xs` en Tailwind v4.
- Migrar los 37 usos:
  - `text-[11px]` → `text-2xs`
  - `text-[10px]` → `text-3xs`
  - `text-[9px]` → dejar puntual en Gantt (caso extremo de densidad) con comentario justificativo, **o** subirlo a `text-3xs` si visualmente no rompe.

**E2. Documentar excepciones `bg-white`**
- Añadir comentario `// intentional: white background required for logo contrast` en `SidebarBranding.tsx`.
- Añadir comentario similar en `DeliverySignatureCard.tsx` (firma sobre "papel").
- Actualizar `mem://design/color-tokens` (o crear si no existe) listando esas 2 excepciones canónicas.

**E3. Changelog + verificación visual**
- Playwright en `/calendario`, `/panel`, `/flujo-caja` para confirmar que las micro-etiquetas no cambian de tamaño perceptible tras la migración.
- Bump **v7.67.0** (minor: expone nuevos tokens tipográficos públicos).
- Marcar cierre del plan de auditoría UI/UX (`.lovable/plan.md`) — Sprints A/B/C/D/E ejecutados.

### Fuera de alcance

- No se rediseña la paleta ni la escala tipográfica principal (Poppins, tamaños de headings).
- No se toca el sistema de radios ni de sombras.
- No se agregan variantes nuevas a badges/tables/buttons (ya cerrado en A–D).

### Riesgo

Bajo. E1 es una extensión aditiva del theme + un barrido regex-guiado; visualmente idéntico (0.6875rem ≡ 11px, 0.625rem ≡ 10px). E2 son solo comentarios.

¿Arranco?
