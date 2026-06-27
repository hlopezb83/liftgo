# Compatibilidad de upgrades major con Lovable

## Restricción dura del stack Lovable

Lovable está fijado a **React 18 · Vite 5 · Tailwind v3 · TypeScript 5**. Cualquier upgrade fuera de ese rango rompe el preview/tagger/HMR de la plataforma aunque el build local pase.

## Veredicto por paquete

### NO actualizar — incompatibles con la plataforma

| Paquete | Salto | Razón |
|---|---|---|
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | 18 → 19 | Lovable corre React 18; `lovable-tagger` y muchos Radix aún no soportan 19 estable aquí. |
| `vite` | 5 → 8 | Lovable fija Vite 5; plugin `lovable-tagger` y `@vitejs/plugin-react-swc 3` están atados. |
| `@vitejs/plugin-react-swc` | 3 → 4 | Requiere Vite 6+. |
| `tailwindcss` | 3 → 4 | Nuevo engine Oxide, config en CSS; Lovable usa Tailwind v3 + `tailwind.config.ts`. |
| `tailwind-merge` | 2 → 3 | Requiere Tailwind v4. |
| `typescript` | 5 → 6 | Lovable fija TS 5; cambios en lib types pueden romper tipos generados de Supabase. |
| `react-router-dom` | 6 → 7 | Cambia a data-router por default; impacta `MainLayout`, `Suspense` por ruta, AuthGuard y customer portal. Riesgo alto, sin beneficio inmediato. |

### NO actualizar — breaking de dominio (alto costo, sin beneficio)

| Paquete | Salto | Razón |
|---|---|---|
| `zod` | 3 → 4 | API de errores y `z.string()` cambia; rompe `nn()`, `RequiredMark`, todos los schemas. |
| `@hookform/resolvers` | 3 → 5 | Solo tiene sentido tras migrar a Zod 4. |
| `date-fns` | 3 → 4 | Nueva API de timezones; impacta `nowMty`, `formatMonthEs`, PDFs y reportes. Regresión de localización casi garantizada. |
| `sonner` | 1 → 2 | Cambia API de toasts; rompe el wrapper global de feedback (`notifyError`, etc.). |
| `react-day-picker` | 8 → 10 | Nueva API de props; shadcn `calendar.tsx` quedaría desalineado. |
| `lucide-react` | 0.462 → 1.x | Rename masivo de íconos; cientos de imports a tocar sin valor funcional. |

### Dev-deps postergables (sin riesgo de seguridad, sin valor inmediato)

`eslint 9→10`, `@eslint/js 9→10`, `eslint-plugin-react-hooks 5→7`, `eslint-plugin-react-refresh 0.4→0.5`, `globals 15→17`, `@types/node 22→26`, `jsdom 20→29`, `@vitest/coverage-v8 4.0→4.1`.

Recomendación: dejar tal cual. Los toolings ya funcionan; subirlos suele forzar cascadas (p.ej. ESLint 10 obliga a actualizar plugins/configs).

## Conclusión

**No hay ningún upgrade major recomendable hoy.** Todo lo crítico ya quedó parchado en v6.97.6–v6.97.12. Mantener el lockfile como está y dejar que Dependabot proponga minors/patches semanalmente.

## Si más adelante quieres mover alguno

Lo abordaría en plan dedicado y aislado, en este orden de menor a mayor riesgo:

1. `eslint` + plugins (dev-only, contenido).
2. `@types/node`, `jsdom`, `globals` (dev-only).
3. `sonner` 2 (wrapper centralizado → cambio focalizado).
4. `react-router-dom` 7 (alto impacto en rutas/guards).
5. `tailwindcss` 4 + `tailwind-merge` 3 (cambio de design system completo).
6. `react` 19 + `vite` 6+ (solo si Lovable libera soporte).
7. `zod` 4 + `@hookform/resolvers` 5 (schemas en todo el proyecto).
8. `date-fns` 4 (timezone — alto riesgo de regresión en MXN/Monterrey).

¿Quieres que prepare un plan detallado para alguno específico o lo dejamos como está?
