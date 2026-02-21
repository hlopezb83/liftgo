
# Mejorar el Scrollbar del Sidebar

## Problema

El sidebar usa `overflow-auto` nativo del navegador (linea 334 de `sidebar.tsx`), lo cual muestra un scrollbar grueso y poco estetico que no combina con el diseno oscuro del sidebar.

## Solucion

Agregar estilos CSS personalizados para scrollbars en toda la app, con estilos especificos para el sidebar oscuro.

### Cambios

| Archivo | Cambio |
|---------|--------|
| `src/index.css` | Agregar estilos globales de scrollbar usando pseudo-elementos `::-webkit-scrollbar`, `::-webkit-scrollbar-track` y `::-webkit-scrollbar-thumb`. Scrollbar delgado (6px), con thumb redondeado y semitransparente que se oscurece al hacer hover. Estilos especiales para el sidebar (thumb claro sobre fondo oscuro). Tambien agregar `scrollbar-width: thin` y `scrollbar-color` para Firefox. |

### Detalles Tecnicos

Se agregaran las siguientes reglas CSS en `src/index.css` dentro de `@layer base`:

- Scrollbar global: 6px de ancho, track transparente, thumb gris semitransparente con bordes redondeados
- Scrollbar en el sidebar (`[data-sidebar="content"]`): thumb claro (blanco semitransparente) para contrastar con el fondo oscuro
- Soporte para Firefox con `scrollbar-width: thin`
- Transicion suave en hover del thumb
