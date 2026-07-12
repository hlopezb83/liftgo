## Objetivo

Silenciar los dos warnings de React Router en consola opt-in a las future flags de v7.

## Cambio

En `src/App.tsx` línea 17, agregar el prop `future` al `<BrowserRouter>`:

```tsx
<BrowserRouter
  future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  }}
>
```

## Verificación

- Recargar preview → los dos warnings desaparecen.
- `bunx vitest run` → los tests ya envuelven con MemoryRouter, no se ven afectados.

## Notas

- Sin cambios de comportamiento visible: `v7_startTransition` envuelve las transiciones de ruta en `React.startTransition` (ya lo hacemos manualmente en `useNavigateTransition`, es idempotente); `v7_relativeSplatPath` sólo aplica a rutas splat anidadas, de las cuales el proyecto no usa.
- No requiere changelog (fix menor de warnings de desarrollo).
