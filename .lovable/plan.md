

# Plan: Persistir filtros de búsqueda en Fleet con URL search params

## Problema
Los filtros (`search`, `statusFilter`) se almacenan en `useState`, que se reinicia al desmontar el componente al navegar a un detalle y volver.

## Solución
Sincronizar los filtros con los query params de la URL (`?q=...&status=...`) usando `useSearchParams` de React Router. Así al volver con el botón "atrás", la URL conserva los parámetros y los filtros se restauran.

## Cambios en `src/pages/Fleet.tsx`

1. Importar `useSearchParams` de `react-router-dom`
2. Reemplazar los dos `useState` por lectura/escritura de search params:
   - `search` ← `searchParams.get("q") || ""`
   - `statusFilter` ← `searchParams.get("status") || "all"`
   - `setSearch` y `setStatusFilter` actualizan los search params (eliminando el param si está vacío/"all")
3. Sin cambios en otros archivos — es un patrón autocontenido

Este mismo patrón se puede replicar en otras páginas de listado en el futuro.

