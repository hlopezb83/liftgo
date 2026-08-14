# Plan: Accesibilidad de paginación — `<a>` → `<button>`

## Diagnóstico (verificado leyendo el código)

`src/components/ui/pagination.tsx` define `PaginationLink` como un `<a>` **sin `href`**. El único consumidor es `src/components/feedback/TablePagination.tsx`, que usa `onClick` para cambiar de página (navegación JS, no ruta).

Esto produce dos problemas reales de accesibilidad:

1. **No es enfocable por teclado.** Un `<a>` sin `href` no entra al orden de tabulación (`Tab` no lo alcanza), así que los usuarios de teclado/lector de pantalla no pueden usar la paginación. Infringe WCAG 2.1.1 (Teclado) y 2.4.3 (Orden de foco).
2. **"Deshabilitado" es un hack visual.** En `TablePagination`, prev/next en los extremos se desactivan con `pointer-events-none opacity-50`, que bloquea el ratón pero no comunica estado deshabilitado a tecnología asistiva ni evita activación por teclado. Un `<button disabled>` nativo sí lo hace.

El diff propuesto convierte `<a>` en `<button type="button">` y añade `disabled`. Es la corrección correcta, **pero está incompleta**: no actualiza el tipo `PaginationLinkProps` (hoy `ComponentProps<"a">`, sin `disabled`) ni las `ref` (`HTMLAnchorElement`), ni actualiza `TablePagination` para usar `disabled` real. Aplicar solo el diff rompería el tipado.

## Cambios a implementar

### 1. `src/components/ui/pagination.tsx`
- `PaginationLinkProps`: cambiar a `ComponentProps<"button">` y conservar `isActive?: boolean` + `Pick<ButtonProps, "size">`.
- `PaginationLink`: renderizar `<button type="button" disabled={disabled} aria-current={isActive ? "page" : undefined} ref={ref} ...>` con las mismas `buttonVariants`. La prop `disabled` viene incluida en `ComponentProps<"button">`.
- Cambiar el `ref` de `HTMLAnchorElement` → `HTMLButtonElement` en `PaginationLink`, `PaginationPrevious`, `PaginationNext`.

### 2. `src/components/feedback/TablePagination.tsx`
- `PaginationPrevious`: reemplazar `className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}` por `disabled={page === 1}` (quitar el hack de `pointer-events`/`opacity` y el `cursor-pointer`).
- `PaginationNext`: reemplazar `className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}` por `disabled={page === totalPages}`.
- `PaginationLink` de páginas: quitar `className="cursor-pointer"` (un `<button>` no necesita cursor hack).

### 3. Estilos del botón deshabilitado
- Verificar que `buttonVariants` + `disabled` renderiza correctamente (opacidad nativa del botón). Si el estado deshabilitado no se ve diferenciado, añadir `disabled:pointer-events-none disabled:opacity-50` a la variante `ghost`/`outline` o a la clase del `PaginationLink`.

## Fuera de alcance
- No cambiar `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationEllipsis` (no son interactivos).
- No modificar el cálculo de `visiblePages` ni la lógica de paginación.

## Verificación
- `tsgo --noEmit` (el cambio de tipos de `a` → `button` puede afectar a `TablePagination` y a cualquier `onClick`/`href` existente).
- ESLint sobre ambos archivos.
- Revisar visualmente la paginación en una tabla con >1 página (Feedback) para confirmar que botones activos/deshabilitados y la página actual se ven igual que antes.
