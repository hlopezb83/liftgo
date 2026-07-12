
# Auditoría Tailwind v4.3 — LiftGo

## Veredicto general

**Implementación limpia y sólida (8/10).** Está por encima del promedio: v4 con motor Oxide, tokens semánticos vía CSS variables HSL, cero colores hardcoded en componentes (0 `[#hex]`, sólo 1 archivo con clases `bg-gray-…`), 246 archivos con iconos centralizados y guardrails ESLint. **No está top-of-the-line todavía** por 4 razones específicas abajo.

---

## Lo que está bien

- **v4 nativo** con `@import "tailwindcss"`, `@tailwindcss/postcss` y `tw-animate-css` (no legacy).
- **Design tokens** completos en `src/index.css` (status, gantt, crm, chart, sidebar) con dark mode paralelo.
- **Sin abuso de `@apply`** (sólo 4 usos totales en base/components).
- **Sin `!important`** salvo 2 casos justificados en sidebar variants.
- **cn()** consistente con `clsx + tailwind-merge`, `cva` en 7 primitives shadcn.
- Guardrails: ESLint bloquea lucide directo, prohíbe hex arbitrarios en components.

## Lo que se puede mejorar

### 1. Config puente v3 → migrar a CSS-first puro (`@theme`) — HIGH
Hoy `tailwind.config.ts` (146 LOC) sólo mapea variables HSL a utilities. En v4 esto es **redundante**: el motor Oxide genera utilities automáticamente desde `@theme` en CSS. Beneficios:
- Elimina 146 LOC de config TS.
- HMR más rápido (sin recompilar TS).
- Utilities auto-generadas (`text-status-available`, `bg-gantt-3`) sin duplicar mapeos.

**Riesgo**: bajo, pero requiere migrar `hsl(var(--x))` → sintaxis v4 `--color-x: hsl(var(--x))` dentro de `@theme`.

### 2. Fonts vía `<link>` en `index.html` en lugar de `@import` CSS — MEDIUM
`src/index.css:1` importa Google Fonts con `@import url(...)`, lo que **bloquea el render del CSS crítico**. Mejor: `<link rel="preconnect">` + `<link rel="stylesheet">` en `index.html` (o self-host con `@fontsource/inter`) para paralelizar y evitar FOIT.

### 3. Dark mode declarado pero apenas usado — LOW
Sólo 9 archivos usan `dark:`. Tokens dark existen en `:root .dark` pero no hay toggle ni cobertura. **Decidir**: (a) remover tokens dark y `@custom-variant dark` para simplificar, o (b) completar cobertura + toggle. Actualmente es peso muerto ambiguo.

### 4. Scrollbar CSS repetido — LOW
`src/index.css:190-227` define scrollbars globales + variante sidebar con selectores duplicados. Extraer a `@utility scrollbar-thin` (nueva API v4) o consolidar con custom property `--scrollbar-thumb`.

### 5. Features v4 sin adoptar (oportunidades) — INFO
- **`@container` queries**: 0 usos. Ideal para tarjetas KPI, sidebar responsive, tablas densas.
- **`text-shadow-*`** (nuevo v4.1) y **`inset-shadow-*`** para depth en cards premium.
- **`starting:` variant** para animaciones de entrada declarativas (reemplaza JS/framer-motion en casos simples).
- **`not-*` variant** para reducir CSS combinatorio.
- **Composable variants** (`group-has-*`, `peer-has-*`) para forms complejos.

---

## Plan propuesto (3 lotes)

### Lote A — Simplificación estructural (HIGH)
1. Migrar `tailwind.config.ts` a bloque `@theme` en `src/index.css`. Eliminar el archivo TS y la directiva `@config`.
2. Mover `@import` de Google Fonts a `<link>` con `preconnect` en `index.html`.
3. Decidir destino de dark mode (recomiendo **remover** dado el uso actual; podemos re-agregar cuando exista requisito real).

### Lote B — Utilities & tokens polish (MEDIUM)
4. Extraer scrollbars a `@utility scrollbar-thin` v4.
5. Refactor de `GlobalInvoiceFields.tsx` (único archivo con `bg-gray-*`).
6. Agregar ESLint rule `no-restricted-syntax` que bloquee `bg-(white|black|gray)-\d+` fuera de tokens.

### Lote C — Adopción de features v4 (INFO / opcional)
7. Introducir `@container` en `KpiTile`, `DetailLayout` y sidebar.
8. Usar `starting:` variant en sheets/dialogs para animaciones de entrada sin JS.
9. Aplicar `text-shadow-sm` en headers de PDFs/cards premium.

---

## Estimado de impacto

| Lote | LOC removidas | Perf | Riesgo |
|------|--------------:|-----:|-------:|
| A    | ~150          | +HMR, +FCP | Bajo-medio |
| B    | ~40           | — | Bajo |
| C    | +feats        | +UX percibida | Bajo |

**Tests**: 992/992 deben seguir pasando; validación con `bun run build` y comparación de tamaño CSS (baseline 122 kB).

¿Ejecuto los **3 lotes** completos, sólo **A + B** (limpieza), o prefieres empezar por uno específico?
