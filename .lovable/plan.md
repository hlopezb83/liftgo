## Meses en español en todos los reportes y gráficas

### Hallazgos de la auditoría

Revisé los reportes y gráficas con etiquetas de mes:

| Vista | Estado actual | Acción |
|---|---|---|
| **Estado de Resultados** | Ya en español (v6.91.3) | — |
| **Reporte de Ingresos** (`RevenueReport`) | Ya usa `format(..., { locale: es })` | — |
| **Reporte de Antigüedad de Saldos** | No muestra etiquetas de mes | — |
| **Utilización mensual** (dashboard) | Backend usa `CASE EXTRACT(MONTH ...)` con 'Ene/Feb/...' | — |
| **Flujo de Efectivo - gráfica dashboard** (`CashFlowChart`) | ❌ Backend devuelve `TO_CHAR(month, 'Mon YYYY')` ("Jun 2026") en inglés | **Arreglar** |
| **Página /cash-flow** | Proyección semanal, sin mes en inglés | — |
| **Balance General** | No existe en el proyecto | — (informar al usuario) |

### Cambios

1. **Nuevo helper compartido** `src/lib/format/formatMonthEs.ts`:
   ```ts
   formatMonthShortEs(monthKey: string): string  // "2026-06" → "Jun 26"
   ```
   Usa `Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" })`, capitaliza la primera letra y quita el punto.
2. **`useMonthlyData.ts`** (Estado de Resultados): refactor para usar el helper compartido en lugar del bloque inline actual.
3. **`dashboardSectionHelpers.ts` `mapCashFlow`**: formatear desde `month_key` (ya viene del RPC) con el helper, ignorando el campo `month` en inglés. Actualizar el tipo `StatsLike.cash_flow` para incluir `month_key`.
4. **Test** `dashboardSectionHelpers.test.ts`: actualizar el caso de `mapCashFlow` para pasar `month_key: "2026-05"` y esperar `month: "May 26"`.
5. **Changelog `v6.91.4` (patch)**: entrada en `public/changelog.json` + detalle en `public/changelog/v6.91.4.json`.

### Nota al usuario

- **Balance General** no existe como reporte en el sistema actualmente. Si lo necesitas, dímelo y lo planeamos por separado.
- La página **/cash-flow** muestra proyección semanal (no mensual), así que no aplica.