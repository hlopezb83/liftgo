## Diagnóstico

El CI de ESLint reporta **2111 problems (1 error, 2110 warnings)**. Distribución:

| Regla | Cantidad | Auto-fixable |
|---|---|---|
| `import/order` | ~2074 | ✅ Sí |
| `no-console` | ~20 | ❌ Manual |
| `jsx-a11y/click-events-have-key-events` + `no-static-element-interactions` | ~10 (5 componentes × 2) | ❌ Manual |
| `no-empty` (error) | 1 | ❌ Manual |
| `Unused eslint-disable` | 1 | ✅ Sí (`--fix`) |

**Total auto-fixable: 2015 · Manual: ~96**

## Plan

### Fase 1 · Auto-fix masivo
Ejecutar `bun run lint --fix` sobre `src/`. Resuelve los ~2015 `import/order` + la directiva `eslint-disable` sin uso. Cero riesgo semántico (sólo reordena imports).

### Fase 2 · Fix manual del único `error`
`audit_screenshots_remaining.ts:30` — bloque `catch {}` vacío. Es un script de auditoría en la raíz (no forma parte del bundle). Opciones:
- Añadir comentario `/* noop */` dentro del catch, o
- Excluir el archivo del lint (agregar a `ignores` en `eslint.config.js`) ya que es utilería local.

Elijo **añadir comentario** para mantener el lint global consistente.

### Fase 3 · `no-console` (~20 ocurrencias)
Todas están en scripts de auditoría (`audit_*.ts`) y en algunos helpers de debug (`lib/ui/errorReport.ts`). Convertir a `console.warn`/`console.error` (permitidos) o silenciar con `// eslint-disable-next-line no-console` sólo cuando sea logging deliberado en herramientas locales.

### Fase 4 · `jsx-a11y` (5 componentes)
Componentes afectados: `SwipeableCard.tsx`, y 4 tarjetas en features (kanbans/dashboards). Fix estándar:
- Cambiar `<div onClick>` a `<div role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handler()}>`, o
- Reemplazar por `<button>` con `type="button"` cuando el nodo no contenga controles interactivos anidados.

### Fase 5 · Verificación
Correr `bun run lint` local. Meta: **0 errores, 0 warnings**.

### Fase 6 · Changelog
Nueva entrada `v7.42.0` (minor — limpieza masiva de calidad) con detalle en `public/changelog/v7.42.0.json`.

## Detalles técnicos

- `import/order` corre con `alphabetize: { order: 'asc' }` y grupos separados por saltos — el `--fix` respeta la configuración actual sin tocar lógica.
- El único cambio no-trivial es Fase 4 (a11y): añade `role`, `tabIndex` y handler de teclado; no cambia el comportamiento del mouse ni las clases Tailwind.
- Ningún archivo bajo `src/integrations/supabase/` se modifica (auto-generados).

## Fuera de alcance

- Warnings de `deno` / edge functions (log `3_Edge Functions`): no reportaron esta vez.
- No se re-arquitectura de imports ni se cambian aliases.
