# Plan: Mejoras integrales al sistema de Changelog

Implementar todas las mejoras identificadas (P0–P3) al módulo de Changelog para alinearlo con los estándares del proyecto (TanStack Query, Zod, sonner, accesibilidad) y mejorar UX (búsqueda, deep-linking, versión visible en sidebar).

## Alcance

### P0 — Correcciones críticas

1. **Sincronizar fuente de verdad**
   - Confirmar que `ChangelogPage` consume `public/changelog.json` (vía `fetchChangelog`).
   - Actualizar `mem://index.md` y `architecture.md` para reflejar que `public/changelog.json` es la fuente runtime y `src/lib/changelog.ts` es solo el módulo de acceso (eliminar la regla "ALWAYS update src/lib/changelog.ts" si el array vive en el JSON).
   - Decisión técnica: mantener `public/changelog.json` como única fuente (servida estática, cacheable por CDN).

2. **Validación con Zod**
   - Definir `ChangelogEntrySchema` en `src/lib/changelog.ts` (version, date ISO, type enum, title, description, changes[]).
   - `fetchChangelog` valida con `z.array(ChangelogEntrySchema).parse()` y lanza error tipado si el JSON está corrupto.

3. **Manejo de errores**
   - Reemplazar `useState/useEffect` por `useQuery` (ver P1) para que un fallo de red no deje la UI colgada en "loading".
   - Toast de error con `sonner` y estado de error visible en la página.

### P1 — Estandarización

4. **Migrar a TanStack Query**
   - Crear `src/hooks/useChangelog.ts` con `useQuery({ queryKey: ['changelog'], queryFn: fetchChangelog, staleTime: Infinity })`.
   - `ChangelogPage` consume el hook (loading/error/data).
   - Eliminar el caché manual `_cache` en `changelog.ts`.

5. **Búsqueda**
   - Agregar `<SearchBar>` en `ChangelogPage` que filtra por `version`, `title`, `description` y `changes[]` (case-insensitive).
   - Combinar con el filtro existente de tipo (major/minor/patch).

6. **Deep-linking por versión**
   - Soportar `/changelog#v5.43.2`: al cargar, hacer scroll a la entrada y resaltarla brevemente (anillo `ring-2 ring-primary` 2s).
   - Botón "Copiar enlace" en cada entrada (icono `Link`) que copia `window.location.origin + /changelog#vX.Y.Z` y muestra toast.

7. **Versión visible en `AppSidebar`**
   - En `SidebarFooter`, mostrar `v{currentVersion}` debajo del email del usuario, como `<NavLink>` a `/changelog`.
   - Reusar `useChangelog` + `getCurrentVersion` (sin fetch duplicado gracias a la queryKey compartida).

8. **Ordenamiento robusto**
   - `getCurrentVersion` ordena por `date` descendente con desempate por semver, no por orden de array.

### P2 — Optimización de payload

9. **División del JSON**
   - `public/changelog.json` queda como índice ligero (solo metadatos: version, date, type, title) — payload reducido (~10 KB).
   - Detalles (`description`, `changes[]`) se mueven a `public/changelog/v{X.Y.Z}.json` por entrada.
   - `useChangelog` carga el índice; `useChangelogEntry(version)` (lazy, `enabled` cuando se expande/abre) carga el detalle bajo demanda.
   - Las entradas se renderizan colapsadas mostrando solo el título; expandir dispara la carga del detalle.
   - Script de migración one-shot: `scripts/split-changelog.ts` (Node) que divide el JSON actual y genera los archivos por versión.

### P3 — Organización y accesibilidad

10. **Categorías secundarias**
    - Extender `ChangelogEntrySchema` con `category?: 'feature' | 'fix' | 'docs' | 'refactor' | 'security'` (opcional, retro-compatible).
    - Badge adicional cuando esté presente.
    - Filtro extra por categoría.

11. **Semántica y a11y**
    - Reemplazar `<div>` de la línea de tiempo por `<ol>` con `<li>` por entrada.
    - `aria-label` en filtros, `aria-current` en versión actual, contraste WCAG AA en badges.

### Final
- Agregar entrada **minor** al changelog: "Mejoras integrales al historial de cambios: validación Zod, TanStack Query, búsqueda, deep-linking, versión en sidebar, payload optimizado, categorías y accesibilidad."

## Detalles técnicos

**Archivos nuevos**
- `src/hooks/useChangelog.ts` — hooks `useChangelog()` e `useChangelogEntry(version)`.
- `scripts/split-changelog.ts` — script one-shot para dividir JSON.
- `public/changelog/v*.json` — generados por el script.

**Archivos modificados**
- `src/lib/changelog.ts` — Zod schema, sin caché manual, ordenamiento por date+semver.
- `src/pages/ChangelogPage.tsx` — `useChangelog`, búsqueda, deep-linking, lazy-load de detalle, `<ol>`, categorías.
- `src/components/AppSidebar.tsx` — footer con versión actual + link.
- `public/changelog.json` — reducido al índice (post-script).
- `architecture.md` y `mem://index.md` — fuente de verdad documentada.

**Consideraciones**
- `staleTime: Infinity` en el índice (se invalida al deploy por hash del bundle/SW).
- Mantener compatibilidad: si `changelog.json` aún tiene el formato completo, el código debe funcionar (fallback al `description/changes` inline si no existe el archivo por versión).
- Sin cambios en BD ni edge functions.

## Fuera de alcance
- CMS/UI para editar el changelog (sigue siendo edición manual del JSON).
- i18n del changelog (queda en español).
- RSS/Atom feed.