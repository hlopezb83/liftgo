# Actualizar next-themes a ^0.4

## Contexto
`next-themes@0.3.0` es la versión actual en `package.json`. La librería se usa activamente:
- `src/components/AppProviders.tsx` — `ThemeProvider`
- `src/components/AppSidebar.tsx` — toggle claro/oscuro vía `useTheme`
- `src/components/ui/sonner.tsx` — sincroniza tema de toasts

La 0.4.x es compatible con React 18 y 19 y mantiene la misma API pública (`ThemeProvider`, `useTheme`), por lo que no se requieren cambios de código.

## Cambio

1. `bun add next-themes@^0.4` (actualiza a la última 0.4.x).
2. Verificación rápida: confirmar que el toggle de tema en el sidebar y los toasts siguen reaccionando al cambio claro/oscuro en el preview.

## Changelog

Agregar `v5.61.2` (patch, category `chore`) en `public/changelog.json` + `public/changelog/v5.61.2.json`:
- Título: "Actualización de next-themes a 0.4 para compatibilidad con React 18+"
