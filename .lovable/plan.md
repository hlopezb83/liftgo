# Auditoría — 5 dependencias del Lote 1

## Veredicto general

| Dep | Versión | Uso real | Estado |
|---|---|---|---|
| dompurify | 3.4.12 | 1 archivo (`renderSafeMarkdown`) | ⚠️ Config subóptima |
| postcss | 8.5.17 | `postcss.config.js` (tailwind + autoprefixer) | ✅ Limpio |
| sonner | 2.0.7 | `appFeedback.ts` + `Toaster` shadcn | ⚠️ Duplica API |
| eslint-plugin-react-refresh | 0.5.3 | `eslint.config.js` | ⚠️ Falta `vite` flag |
| jsdom | 26.1.0 (pineado) | `vitest.config.ts` | ⚠️ Alternativa 3-5× más rápida |

Ninguna implementación está rota. La base es sólida (single-point `appFeedback`, ESLint plano moderno, tailwind + autoprefixer estándar). Los hallazgos son de "top of the line", no de bugs.

---

## Hallazgos y mejoras propuestas

### 1. dompurify — configuración por defecto insegura para Markdown con HTML injectado (MEDIA)
`renderSafeMarkdown` llama a `DOMPurify.sanitize(html)` con la config default, que permite `<iframe>`, atributos `on*` bloqueados pero también `<style>` y `<form>`. Para un renderer de Markdown de ayuda basta:
- `ALLOWED_TAGS`: whitelist a `h2..h4, p, strong, em, li, br, div, span`.
- `ALLOWED_ATTR`: solo `class`.
- `RETURN_TRUSTED_TYPES: true` cuando el navegador lo soporta (defensa extra en Chrome).
- Memoizar la instancia (`DOMPurify()` se puede reusar) — pequeño, pero elimina re-init por llamada.

### 2. sonner — el `Toaster` de shadcn re-exporta `toast` (HIGH, escala DRY)
`src/components/ui/sonner.tsx` re-exporta `toast` desde sonner. Eso invita a usar `import { toast } from "@/components/ui/sonner"` y saltarse `appFeedback`. Hoy el guardrail no existe.
- Quitar el re-export de `toast` en `sonner.tsx` (solo dejar `Toaster`).
- Agregar `no-restricted-imports` en `eslint.config.js`:
  - Bloquear `sonner` fuera de `src/lib/ui/appFeedback.ts` y `src/components/ui/sonner.tsx`.
  - Mensaje: "Usa notifySuccess/notifyError/notifyInfo/notifyWarning/notifyAsync de @/lib/ui/appFeedback."
- Migrar los 2 call-sites que usan `toast.*` directo (`GlobalSearch.tsx`, `ErrorDetailsDialog.tsx`) a `notify*`.

### 3. eslint-plugin-react-refresh — falta la opción `allowExportNames`/`vite` (LOW)
La v0.5 introdujo el preset `vite` que reduce falsos positivos para archivos que exportan hooks/constantes junto con componentes. Cambiar a:
```
"react-refresh/only-export-components": ["warn", { allowConstantExport: true, allowExportNames: ["meta", "loader", "action"] }]
```
o directamente `reactRefresh.configs.vite` cuando esté disponible. Reduce el ruido en `warn` sin perder cobertura.

### 4. jsdom — considerar `happy-dom` como opcional (LOW, opcional)
La suite corre 913 tests bajo `jsdom` (necesario para `react-pdf`). Migrar completo NO recomendable (rompimos `jsdom@29` la semana pasada por eso mismo). Alternativa realista:
- Dejar `environment: "jsdom"` como default.
- Habilitar `environmentMatchGlobs` para correr tests puros de lógica (hooks, utils, dominio) bajo `happy-dom` (3-5× más rápido). Reservar `jsdom` sólo para `**/pdf/**` y componentes que serializan CSS.
- Estimado: 40-50% de los archivos son elegibles ⇒ ~20-30% menos de tiempo total. Es un cambio con QA, mejor **fuera** de esta auditoría.
- Recomendación por ahora: **no tocar**, dejar registrado como Lote futuro.

### 5. postcss — sin cambios (OK)
Config mínima idiomática. Vite ya carga `postcss.config.js` automáticamente. Cuando migremos a Tailwind 4 (Lote 3 del roadmap de dependencias), esto se colapsa en `@tailwindcss/postcss` y `postcss.config.js` puede desaparecer. Nada que hacer hoy.

---

## Alcance de la implementación propuesta (si aprobás)

**Cambios en este sprint (bajo riesgo, alto retorno):**
1. Endurecer `renderSafeMarkdown` con whitelist explícita de DOMPurify.
2. Quitar `toast` del re-export de `src/components/ui/sonner.tsx`.
3. Migrar `GlobalSearch.tsx` y `ErrorDetailsDialog.tsx` a `notify*`.
4. Añadir `no-restricted-imports` para `sonner` en `eslint.config.js`.
5. Ajustar la regla de `react-refresh` con `allowExportNames`.
6. Test unitario para `renderSafeMarkdown` verificando que se strippean `<script>`, `<iframe>`, `on*`.
7. Actualizar changelog `v7.30.0` (minor: endurecimiento + guardrail nuevo).

**Fuera de alcance (queda anotado):**
- `happy-dom` split por globs — sprint dedicado con benchmark.
- Tailwind 4 / vite 6 / react-router 7 — Lote 3 del roadmap ya planeado.

## Detalles técnicos

- Test target: `src/features/help/lib/__tests__/renderSafeMarkdown.test.ts` con casos `<script>`, `<iframe>`, `<a href="javascript:...">`, `onerror` attr.
- ESLint `no-restricted-imports` para `sonner` va como bloque nuevo con `files: ["src/**/*.{ts,tsx}"]` e `ignores` a `appFeedback.ts` y `sonner.tsx`.
- Cero cambios en runtime toasts existentes: la firma de `notify*` ya cubre 100% del uso actual.
- Verificación: `bun run lint`, `bun run test`, `tsgo`.
