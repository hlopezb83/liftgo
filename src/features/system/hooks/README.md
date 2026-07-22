# system — hooks

Hooks del feature `system` (búsqueda global, atajos, etc.). Convención
`features/<x>/{components,hooks,lib,pages}`.

- `useEntitySearch` — consulta multi-tabla (facturas / clientes /
  reservas) para el buscador global (Ctrl+K). Extraído en v6 audit P1-1
  desde `src/layouts/GlobalSearch.tsx` para respetar "UI shell no habla
  con la DB".
