## Causa (confirmada)

En `src/layouts/sidebar/SidebarNavSection.tsx` (línea 71) el resaltado se decide con:

```ts
const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
```

Estando en `/invoices/reconciliation`, ese prefijo también coincide con el ítem **Facturas** (`/invoices`), así que los dos se pintan como activos. En el menú actual es el único par anidado (`/invoices` vs `/invoices/reconciliation`).

Analogía: es como buscar en un directorio por "empieza con"; al escribir "Juan" también te salta "Juan Carlos".

## Cambio propuesto

Elegir siempre **la ruta más específica** que coincida, en vez de marcar todas las que coincidan por prefijo:

1. Nuevo helper de activación (en `src/layouts/sidebar/`) que:
   - considere coincidencia sólo en frontera de segmento (`/invoices` coincide con `/invoices` y `/invoices/123`, pero no con `/invoicesx`);
   - entre todos los ítems del menú que coincidan, marque activo únicamente el de URL más larga.
2. Usarlo en el ítem de navegación (línea 71) y en la detección de "grupo con ítem activo" (línea 145), para que la lógica sea la misma en ambos lugares.

Con esto, en `/invoices/reconciliation` sólo se resalta **Conciliación de Pagos**, y en `/invoices` o `/invoices/<id>` sólo **Facturas**. El grupo "Dinero" sigue expandiéndose igual.

## Validación

- Prueba unitaria del helper con los casos: `/invoices`, `/invoices/ca82…`, `/invoices/reconciliation`, `/` y una ruta sin coincidencia.
- Revisión visual en el preview de `/invoices/reconciliation` y `/invoices`.
- Entrada de changelog v7.248.3 (`public/changelog.json` + `public/changelog/v7.248.3.json`).

## Detalles técnicos

- Archivos: `src/layouts/sidebar/SidebarNavSection.tsx`, nuevo `src/layouts/sidebar/isNavItemActive.ts` (+ test), changelog.
- Sólo cambia la presentación del menú; no se toca ninguna ruta ni lógica de negocio.
