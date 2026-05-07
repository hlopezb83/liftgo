# Corregir desalineación de rutas de Devoluciones

## Problema confirmado

En `src/lib/routes-config.tsx` (líneas 79-80) las rutas reales son:
- `/returns`
- `/returns/:id`

Pero en `src/lib/routes.ts` (líneas 34-37) la constante `ROUTES.returnInspections` apunta a:
- `/return-inspections`
- `/return-inspections/${id}`

Aunque hoy nadie consume `ROUTES.returnInspections` (todos los demás archivos usan el literal `/returns`), la constante es una trampa: si alguien la importa terminará en 404.

## Cambio

Editar `src/lib/routes.ts` para que `returnInspections` quede:

```ts
returnInspections: {
  list: "/returns",
  detail: (id: string) => `/returns/${id}`,
},
```

## Verificación

- `rg "return-inspections" src` debe regresar vacío después del cambio (excepto el label en `TopbarBreadcrumbs.tsx`, que es solo texto y no afecta).
- Revisar `TopbarBreadcrumbs.tsx` línea 13: la key `"return-inspections"` ya no coincide con ningún segmento de URL. Cambiarla a `"returns": "Devoluciones"` para que el breadcrumb muestre el nombre correcto.

## Changelog

Agregar `v5.61.1` (patch) en `public/changelog.json` + `public/changelog/v5.61.1.json` describiendo la corrección de la ruta y el breadcrumb.
