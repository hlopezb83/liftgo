## Resumen

Revisé las utilidades y componentes "caseros" del ERP comparándolos con librerías maduras. **La conclusión honesta: el código actual está bien arquitecturizado y la mayoría de "reinventos" son intencionales y mínimos.** Solo encontré **2 candidatos con beneficio real** y varios donde migrar **empeoraría** las cosas.

---

## Vale la pena migrar (2)

### 1. `exportToCsv` → `papaparse` (recomendado)

**Hoy** (`src/lib/exportCsv.ts`, 21 LOC): serializador CSV propio.

**Problemas reales**:
- No escapa saltos de línea dentro de celdas (rompe Excel si una nota tiene `\n`).
- No agrega BOM UTF-8 → caracteres con acentos se ven mal en Excel español.
- Convierte fechas/objetos con `String()` sin formato controlado.

**Beneficio**: exports de clientes, facturas, gastos, etc. abren correctamente en Excel mexicano sin caracteres rotos. Papaparse pesa ~45 KB minified pero solo se usa al exportar (puede ir lazy-loaded).

**Trade-off**: agregamos una dependencia para resolver bugs reales que ya nos van a morder cuando un cliente con `ñ` o una nota multilínea aparezca en un export.

### 2. `DataTable` + `useSort` + `usePagination` → `@tanstack/react-table` (opcional, mediano plazo)

**Hoy**: `DataTable.tsx` (170 LOC) + `useSort` (61 LOC) + `usePagination` (29 LOC) + `SortableTableHead` + `TablePagination`. Todo client-side.

**Cuándo conviene migrar**:
- Cuando agreguemos **column resizing**, **column visibility toggle**, **multi-sort**, o **virtualización** para listas grandes.
- Cuando empiece a doler que las tablas no comparten lógica de filtros con `useListFilters`.

**Cuándo NO**: hoy. El sistema actual cumple Power of 10, es predecible y bajo en LOC. Migrar ahora es deuda sin retorno claro.

**Recomendación**: dejarlo como **regla de oro a futuro**: la próxima vez que una tabla pida features avanzadas, migrar **esa** primero como prueba y evaluar.

---

## NO vale la pena migrar (lo verifiqué)

| Código actual | Alternativa rechazada | Razón |
|---|---|---|
| `ImageGalleryLightbox` (126 LOC) | `yet-another-react-lightbox` | Ya cubre teclado, swipe táctil, zoom, miniaturas. Migrar añade ~30 KB sin nuevas features. |
| `useDebouncedValue` (14 LOC) | `use-debounce` | 14 líneas vs nueva dependencia. Cero ganancia. |
| `useSort` / `usePagination` por separado | `@tanstack/react-table` | Ver arriba: solo si DataTable evoluciona. |
| `formatCurrency` (27 LOC) | librería externa | `Intl.NumberFormat` nativo es más que suficiente. |
| `nowMty()` y helpers de fecha | librería extra | Ya usamos `date-fns` + `date-fns-tz`. |
| PDFs de cotización/factura/contrato | template engine | Diseño A4 brand-specific, intencionalmente custom. |
| `GlobalSearch` (Ctrl+K) | re-añadir `cmdk` | Ya usa `@/components/ui/command` que envuelve cmdk vía shadcn. **Funciona**, no migrar. |
| Validación de formularios | otra lib | `react-hook-form` + `zod` ya es el estándar. |
| Kanban (CRM, Mantenimiento) | otra lib DnD | `@hello-pangea/dnd` ya cumple, sin razón para cambiar. |

---

## Plan de acción propuesto

**Fase 1 — Inmediata (recomendada):**
1. `bun add papaparse @types/papaparse`
2. Reescribir `src/lib/exportCsv.ts` para usar `Papa.unparse` con BOM UTF-8 y escape correcto de saltos de línea.
3. Verificar exports actuales (clientes, facturas, gastos, proveedores) abren bien en Excel.
4. Entrada en changelog v5.82.1 (patch, category: "fix").

**Fase 2 — Diferida (no hacer hoy):**
- Dejar documentado en memoria que **`DataTable` se migrará a `@tanstack/react-table` cuando aparezca el primer requerimiento de features avanzadas** (resize, virtualización, etc.), no antes.

---

## Detalles técnicos (Fase 1)

```ts
// src/lib/exportCsv.ts
import Papa from "papaparse";

export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[]
): void {
  if (rows.length === 0) return;
  const csv = Papa.unparse(rows, { header: true, newline: "\r\n" });
  // BOM para que Excel español detecte UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

Papaparse maneja automáticamente:
- Comillas dentro de campos
- Saltos de línea dentro de celdas
- Valores `null` / `undefined`
- Headers a partir de keys del objeto

**Impacto en bundle**: solo en chunks que importan `exportToCsv` (páginas de listado). Si preocupa, se puede `await import('papaparse')` dentro del handler de "Exportar".

---

¿Procedo solo con la Fase 1 (papaparse), o prefieres que también deje la nota en memoria sobre la regla diferida para `DataTable`?
