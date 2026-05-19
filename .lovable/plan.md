## Origen

GitHub Actions corre `bun run lint` en cada push y el job falló por **1 error + 5 warnings** introducidos por los últimos cambios (DataTable v2, fix de changelog) más uno preexistente (`FeedbackDetailSheet`). ESLint en este proyecto está configurado con `complexity: 12` como límite estricto.

## Errores y warnings a resolver

| # | Archivo | Tipo | Causa |
|---|---------|------|-------|
| 1 | `src/components/dataTable/v2/types.ts` (35) | **error** `@typescript-eslint/no-empty-object-type` | `interface ColumnMeta extends LiftgoColumnMeta {}` está vacía |
| 2 | `src/components/dataTable/v2/types.ts` (34) | warning | `eslint-disable` sin uso (consecuencia del fix #1) |
| 3 | `src/components/dataTable/v2/DataTableHeaderV2.tsx` (38) | warning | `complexity 15` en el `.map(header => …)` |
| 4 | `src/components/dataTable/v2/DataTableV2.tsx` (27) | warning | `complexity 13` en `Inner` |
| 5 | `src/features/changelog/lib/changelog.ts` (55) | warning | `complexity 13` en `comparePre` |
| 6 | `src/features/feedback/components/FeedbackDetailSheet.tsx` (26) | warning | `complexity 18` (preexistente, agravado por chips/AI) |

## Cambios propuestos

### 1-2 · `types.ts`
Reemplazar la interface vacía por la **augmentación con campos explícitos** (sin `extends`, sin disable). Mantiene el contrato exacto y elimina ambos hallazgos:

```ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: ColumnAlign;
    hideOnMobile?: boolean;
    headClassName?: string;
    cellClassName?: string;
  }
}
```

`LiftgoColumnMeta` sigue exportándose como tipo público (consumidores siguen importándolo).

### 3 · `DataTableHeaderV2.tsx`
Extraer el renderizado por columna a un sub-componente `<HeaderCell column={...} />` ≤80 LOC. El `.map` queda reducido a `headers.map(h => <HeaderCell key={h.id} header={h} />)` → complejidad cae a ≤4.

### 4 · `DataTableV2.tsx`
Extraer:
- el cálculo de `selectedIds` + `toolbarCtx` a un hook local `useToolbar(table)` (≤30 LOC), o a un componente `<SelectionToolbar />`.
- el fallback móvil a un helper `renderMobile(...)`.

Esto baja la ciclomática del `Inner` por debajo del umbral.

### 5 · `changelog.ts comparePre`
Extraer el paso "convertir token a `{ kind: "num"|"str", value }`" a un helper `parseToken(s)`. El bucle queda con un único `compareTokens(parseToken(x), parseToken(y))` → complejidad ≤6.

### 6 · `FeedbackDetailSheet.tsx`
Extraer dos sub-componentes (ya hay precedente con `FeedbackDetailParts`):
- `FeedbackChipsRow` (badges tipo/módulo/severidad/AI).
- `AiReasoningCard` (bloque "Razonamiento del AI" con botón Reclasificar).

Esto baja la complejidad del cuerpo principal a ≤8 y mejora la legibilidad. No cambia comportamiento.

## Verificación

- `bun run lint` debe terminar con **0 errores y 0 warnings**.
- `tsc` debe seguir verde (sin cambios de tipo público).
- Probar visualmente:
  - Cualquier list page con DataTable v2 (cabecera/sort).
  - Apertura del sheet de feedback (chips + AI bloque).
  - El modal del changelog ordena pre-release antes de la versión estable correspondiente.

## Changelog

Entrada `6.5.0-alpha.5` patch / fix: "Lint CI: resolver complexity warnings y empty interface en augmentación de TanStack".

## Fuera de alcance

- No subir el umbral de `complexity` global ni añadir `eslint-disable`.
- No tocar lógica funcional de feedback ni de v2; solo descomposición y tipado.
