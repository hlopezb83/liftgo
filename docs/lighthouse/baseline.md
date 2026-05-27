# Lighthouse Baseline — v6.13.2

Baseline inicial para comparar regresiones de performance en versiones futuras.

## Cómo regenerar

```bash
bash scripts/lighthouse-baseline.sh
```

Esto corre Lighthouse en preset `desktop` contra las rutas públicas y guarda
los JSON en `docs/lighthouse/{ruta}.json`. Luego se actualiza esta tabla a mano.

## Rutas públicas (auto)

| Ruta | Performance | A11y | Best Practices | SEO | LCP | CLS | TBT | Fecha |
|------|-------------|------|----------------|-----|-----|-----|-----|-------|
| `/` (AuthPage) | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ | — | — | — | 2026-05-27 |
| `/portal/login` | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ | — | — | — | 2026-05-27 |

> Los números quedan vacíos hasta la primera corrida del script. Se debe
> ejecutar localmente porque CI no tiene Chrome dedicado para Lighthouse.

## Rutas autenticadas (manual)

Para `/`, `/fleet`, `/invoices`, etc., Lighthouse necesita un flujo de login
custom. Hasta tener ese script:

1. Abrir Chrome DevTools → Lighthouse.
2. Loguearse manualmente.
3. Generar reporte en modo "Navigation".
4. Pegar scores acá.

| Ruta | Performance | A11y | Best Practices | SEO | Fecha |
|------|-------------|------|----------------|-----|-------|
| `/` (Dashboard) | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ | 2026-05-27 |
| `/fleet` | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ | 2026-05-27 |
| `/invoices` | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ | 2026-05-27 |

## Umbrales esperados (no bloqueantes en v6.13.2)

- Performance ≥ 80
- A11y ≥ 90
- Best Practices ≥ 90
- SEO ≥ 85
- LCP < 2.5s
- CLS < 0.1
- TBT < 300ms

Cuando los scores reales se midan, si caen por debajo del umbral se levantan
issues — pero no se bloquea el release del RC actual.
