

# Plan: Hacer scrollable el diálogo de prospecto en pantallas pequeñas

## Problema
El diálogo del prospecto (`ProspectFormDialog`) tiene muchos campos (empresa, contacto, email, teléfono, cotización, valor, notas, botón de conversión) y en pantallas pequeñas se desborda sin scroll.

## Solución
Envolver el contenido del formulario (entre el header y el footer) en un `ScrollArea` con `max-h-[60vh]`, permitiendo scroll interno cuando el contenido excede la altura visible.

## Cambio en `src/components/crm/ProspectFormDialog.tsx`

1. Importar `ScrollArea` de `@/components/ui/scroll-area`
2. Envolver el `<form>` internamente con un `ScrollArea` con clase `max-h-[60vh]` y padding derecho para el scrollbar
3. Mover el `DialogFooter` fuera del área scrollable para que los botones siempre sean visibles

