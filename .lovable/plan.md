# Fix: "Failed to fetch dynamically imported module" tras redeploy

## Causa raíz

Después de un nuevo deploy, los chunks con hash anterior (`QuotesPage-CXtStOvh.js`) dejan de existir en el CDN. Cuando el usuario navega a una ruta `lazy()` cargada después del deploy, el import dinámico falla y React Suspense propaga el error al ErrorBoundary.

Vite emite el evento `vite:preloadError` para exactamente este caso. La solución estándar es escucharlo y forzar `window.location.reload()` una sola vez — el navegador descargará el `index.html` fresco con los nuevos hashes.

## Cambios

### 1. `src/main.tsx`
Añadir listener antes del `createRoot`:

```ts
window.addEventListener("vite:preloadError", (event) => {
  // Evita loop si la recarga también falla
  if (sessionStorage.getItem("vite-preload-reload") === "1") return;
  sessionStorage.setItem("vite-preload-reload", "1");
  event.preventDefault();
  window.location.reload();
});

// Limpia el flag tras carga exitosa
window.addEventListener("load", () => {
  sessionStorage.removeItem("vite-preload-reload");
});
```

### 2. `src/layouts/ErrorBoundary.tsx` (defensa en profundidad)
Si el error que cae al boundary contiene el mensaje "Failed to fetch dynamically imported module" o "Importing a module script failed", recargar automáticamente (mismo guard de sessionStorage). Esto cubre casos donde el error no pase por el evento `preloadError` (p. ej. import disparado por código no-preload).

### 3. Changelog
Patch **6.14.6** — "Auto-recarga cuando el navegador apunta a archivos viejos tras un nuevo deploy".

## Verificación

No se puede reproducir sin un deploy real entre cargas, pero:
1. `App` sigue arrancando sin warnings.
2. En DevTools, disparar manualmente `window.dispatchEvent(new Event("vite:preloadError"))` provoca un reload.
3. Borrar una cotización (flujo que el usuario reportó) sigue funcionando sin cambios.

## Nota

No se cambia la lógica de borrado ni rutas — el borrado funcionó, solo la recarga de la página de destino tropezó con el chunk obsoleto.
