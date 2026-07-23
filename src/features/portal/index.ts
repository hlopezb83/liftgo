// Barrel público de la feature `portal`.
// Sólo expone hooks/utilidades consumidos por otras features.
// Las páginas se importan por ruta explícita desde `src/layouts/CustomerPortalRoutes.tsx`
// y `src/routes/router.tsx` (lazy chunks). Cuídalo — re-exportar páginas aquí
// obliga a bundlear todo el portal al importar cualquier hook.
export * from "./hooks/usePortalExtras";
