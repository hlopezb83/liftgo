# Corregir error LIFTGO-Q (navegadores antiguos)

## Hallazgo
- Sentry tiene 1 error pendiente de Lift GO: `LIFTGO-Q` — "e.matches.at is not a function", 1 vez (11 nov, 23:01 UTC), versión 8.53.0, en la página de inicio.
- Causa: `src/layouts/AppProviders.tsx` usa `.at(-1)`, que no existe en navegadores antiguos (p. ej. Safari anterior a 15.4). La app falla al abrir.
- Los demás errores (JAVASCRIPT-REACT-*: LC_COT_*, LC_CXP_FOLIO_DUPLICADO, LC_CONCEPTO_PROFORMADO, etc.) son de Libre Carga, otra app; no se tocan.

## Cambios
1. En `AppProviders.tsx`, reemplazar `state.matches.at(-1)` por `state.matches[state.matches.length - 1]` (mismo resultado, compatible).
2. Buscar otros `.at(` en `src/` y aplicar el mismo cambio si están en código que corre al abrir la app.
3. Prueba puntual: la detección de la ruta `/auth` devuelve verdadero/falso igual que antes.
4. Changelog: entrada patch.
5. Marcar `LIFTGO-Q` como resuelto en Sentry tras el cambio.

Sin cambios en base de datos, funciones fiscales ni publicación.
