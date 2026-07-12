## Problema

En el sidebar, el logo de la empresa (HERREN ENERGY) carga correctamente (253×75 px), pero se renderiza dentro de un contenedor cuadrado de 36×36 px con `p-1` (área útil ~28×28). Al ser un logo horizontal (aspect ratio 3.37:1), `object-contain` lo reduce a una franja tan pequeña que se ve vacío/gris.

Evidencia: screenshot muestra el cuadro `bg-sidebar-accent` prácticamente vacío junto a "HERREN ENERGY SA DE CV".

## Cambio propuesto

Ajustar únicamente `src/layouts/sidebar/SidebarBranding.tsx` para que, cuando exista `logoUrl`, el logo use un contenedor rectangular que respete su aspect ratio natural:

- Contenedor pasa de `h-9 w-9 rounded-lg bg-sidebar-accent p-1` a algo como `h-9 w-auto max-w-[7rem] shrink-0` (sin fondo, sin padding, sin recorte cuadrado).
- `img` mantiene `h-full w-auto object-contain`.
- Fallback "LG" queda igual (cuadrado 36×36).
- Se conserva el `alt`, el título y el subtítulo "Montacargas".

Sin cambios en lógica, hooks, queries ni RLS. Solo presentación.

## Verificación

1. Playwright headless a `/` con sesión inyectada, screenshot del sidebar expandido — el logo horizontal debe verse legible.
2. Verificar también con sidebar colapsado (`collapsible="icon"` si aplica) que no rompa el layout.
3. Registrar entrada en `public/changelog.json` + `public/changelog/v7.61.2.json` (patch, categoría fix UI).

## Fuera de alcance

- No se toca el logo de AuthPage.
- No se cambia el uploader ni la política del bucket.
- No se altera el fallback "LG".