

# Plan: Preservar filtros al usar la flecha "atrás" de la app

## Problema
El `DetailPageHeader` usa `navigate(backTo)` con una ruta fija (`/fleet`), lo cual descarta los query params (`?q=...&status=...`) que guardaban los filtros.

## Solución
Cambiar el botón de "atrás" para usar `navigate(-1)` (equivalente al historial del navegador). Esto funciona porque al navegar de `/fleet?q=35` → `/fleet/abc`, el paso atrás regresa a `/fleet?q=35` con los filtros intactos.

Se mantiene `backTo` como fallback por si el usuario llegó directamente a la página de detalle (sin historial previo).

## Cambio en `src/components/DetailPageHeader.tsx`

- Cambiar el `onClick` del botón de atrás: en lugar de `navigate(backTo)`, usar `navigate(-1)` para volver a la página anterior con sus query params.
- Esto aplica globalmente a todas las páginas de detalle que usan este componente.

