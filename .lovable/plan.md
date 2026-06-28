# Fase 3 — Parte 3: Páginas internas con headers manuales

Cerramos la unificación de layout migrando las páginas internas que aún construyen su header a mano o usan paddings/anchos redundantes. Las páginas de formularios (`*Form.tsx`) y detalle (`*Detail.tsx`) ya usan `FormPageHeader` / `DetailPageHeader` y quedan fuera de alcance.

## Páginas a migrar

| Página | Cambio |
|---|---|
| `ChangelogPage.tsx` | Quitar `p-6 max-w-3xl mx-auto`, usar `PageContainer maxWidth="form"` + `PageHeader` |
| `OperationsSetupPage.tsx` | Quitar `p-6 max-w-5xl`, usar `PageContainer maxWidth="wide"` (ya usa `PageHeader`) |
| `HelpPage.tsx` | Reemplazar contenedor manual `p-6 max-w-*` por `PageContainer` |
| `InventoryPage.tsx` | Reemplazar `h1 text-2xl` manual por `PageHeader` |
| `MrrDetailPage.tsx` | Auditar — si aún tiene `text-2xl font-bold` residual, migrar a `PageHeader` |
| `LeaderboardPage.tsx` | Reemplazar `<h1>` manual por `PageHeader` |

## Reglas

- `PageContainer` sin padding propio (lo da `MainLayout`).
- Mantener `max-w-*` específicos vía prop `maxWidth` (`form`=3xl, `wide`=5xl).
- No tocar `FormPageHeader`/`DetailPageHeader` ni vistas ya migradas.
- No tocar lógica de negocio ni tokens de color.
- `NotFound.tsx` y `CRMToolbar.tsx`: fuera de alcance (no son páginas estándar de listado).

## Entrega

- Versión **v6.98.4** (patch) + entrada en `public/changelog.json` y `public/changelog/v6.98.4.json`.
