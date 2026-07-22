# `quotes/hooks/` — organización

Estructura recomendada (aplicada de forma incremental — v6 audit P3-9):

- `quotes/` — CRUD principal.
- `quoteDetail/` — vistas detalle (`useQuoteDetailData`, conversion a reserva).
- `quoteForm/` — hooks de formularios (`useQuoteFormLogic`).

Cuando agregues nuevos hooks, colócalos en la sub-carpeta que corresponda antes de crear un archivo suelto en la raíz.
