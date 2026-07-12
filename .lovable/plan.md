# Plan: Migración a Tailwind CSS v4

Actualmente estamos en `tailwindcss@3.4.19`. La v4 es un cambio **major** con motor nuevo (Oxide), configuración CSS-first, nuevo plugin PostCSS y varios breakings. Propongo migración completa por lotes con validación al final de cada uno.

## Alcance

- `tailwindcss` 3.4 → 4.x
- `postcss.config.js` → usar `@tailwindcss/postcss`
- `tailwind.config.ts` → migrar tokens al bloque `@theme` en `src/index.css` (o mantener `@config` como puente temporal)
- `tailwindcss-animate` → reemplazar por `tw-animate-css` (recomendado oficial para v4) o mantener vía `@plugin`
- `@tailwindcss/typography` → cargar vía `@plugin "@tailwindcss/typography"`
- Codemods automáticos + auditoría manual de clases removidas/renombradas

## Lotes

**Lote 1 — Setup y dependencias**
- Instalar `tailwindcss@4`, `@tailwindcss/postcss`, `tw-animate-css`
- Reescribir `postcss.config.js` con `@tailwindcss/postcss`
- Cambiar `@tailwind base/components/utilities` por `@import "tailwindcss"` en `src/index.css`
- Cargar plugins con `@plugin` directives
- Mantener `@config "./tailwind.config.ts"` como puente para no perder tokens en el paso 1

**Lote 2 — Codemod y clases renombradas**
- Ejecutar `npx @tailwindcss/upgrade` (codemod oficial)
- Revisar reemplazos comunes: `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded-sm`→`rounded-xs`, `outline-none`→`outline-hidden`, `ring`→`ring-3`, opacidad de bordes por defecto (`border-gray-200` ya no aplica opacity default), `bg-opacity-*` deprecado, etc.
- Revisar variantes `space-x-*` (cambio en selector) en listas críticas

**Lote 3 — Migrar tokens a `@theme` CSS-first**
- Trasladar `colors`, `borderRadius`, `fontFamily`, `keyframes`, `animation` de `tailwind.config.ts` a bloque `@theme` en `src/index.css`
- Mantener variables HSL semánticas existentes (`--primary`, `--status-*`, `--gantt-*`, `--crm-*`, `--accent-gold`) sin cambios; sólo mapear en `@theme` con `--color-primary: hsl(var(--primary))` etc.
- Eliminar `tailwind.config.ts` y la directiva `@config` una vez validado

**Lote 4 — Validación**
- `tsgo` typecheck
- `vitest run` (esperado 921+ tests verdes)
- `bun run build` y verificar tamaño de CSS (debería bajar)
- Recorrido visual smoke: Dashboard, Cotizaciones, Reservas, Facturación, CRM, Mantenimiento, Portal Cliente (dark + light mode)
- Verificar PDFs (react-pdf no depende de Tailwind pero validar que no se rompa el build)
- Changelog `v7.36.0` (minor por infraestructura, sin cambios funcionales)

## Detalles técnicos

- **Navegadores soportados por v4**: Safari 16.4+, Chrome 111+, Firefox 128+. Confirmar que aplica a la base de usuarios (interno, sí aplica).
- **Riesgos**:
  - `tailwindcss-animate` no es oficialmente v4-compatible; `tw-animate-css` es drop-in recomendado por shadcn.
  - Cambio de default color de `border-*` de `gray-200` a `currentColor`; podría alterar bordes sin color explícito. Auditar con `rg "className=[\"'][^\"']*\\bborder\\b(?![-:])"` y agregar `border-border` donde falte.
  - `shadcn/ui` componentes ya soportan v4 pero pueden requerir ajustes menores en `components.json` (`tailwind.css` en vez de `tailwind.config`).
- **Rollback**: mantener commit granular por lote para revertir individualmente.

## Alternativa (si prefieres cero riesgo hoy)

Quedarnos en v3 y sólo bumpear a la última `3.4.x` patch. Sin ganancias de performance del motor Oxide ni CSS-first, pero cero riesgo. Recomiendo **no** ir por acá — v3 ya no recibe features nuevas.
