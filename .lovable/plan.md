# Cierre v7.318.2 — verificación de los 7 hallazgos

Revisé cada punto contra el código y la base de datos. Resultado: **5 son bugs reales, 1 ya está corregido, 1 es parcialmente correcto**.

## Veredicto

| # | Hallazgo | Estado |
|---|---|---|
| 1 | `.env` sigue en el índice de git | Real (confirmado: `git ls-files` lo lista) — no puedo ejecutarlo yo |
| 2 | "AI" → "IA" en FeedbackDetailChips | Ya corregido en v7.318.3 |
| 3 | 3 botones "Cancelar" crudos | Parcial: 3a y 3c son reales; 3b (RejectQuoteDialog) ya usa el componente |
| 4 | Texto del logo dice "SVG" pero ya no se acepta | Real |
| 5 | 4 consumidores usan la fecha local del navegador | Real (Calendar x2, FleetPage, ForkliftDetail) |
| 6 | Carrera en `stage_order` del Kanban CRM | Real, con matiz: ya existen **2 grupos duplicados** en la tabla |
| 7 | Auto-match bancario ignora pagos en otra moneda | Real (la función filtra `currency = v_line_currency` sin convertir) |

## Qué haría

1. **`.env`**: no puedo correr comandos de git. Te dejo el comando exacto para ejecutarlo tú.
2. **Diálogos (3a, 3c)**: cambiar los botones crudos de `UploadSupplierRepDialog` y `DeleteAuditLogDialog` por `FormDialogCancelButton`, respetando `isPending`.
3. **Logo**: quitar "SVG" del texto de ayuda.
4. **Fecha del servidor**: cablear `useServerTodayMty` en `CalendarStatCards`, `EquipmentListView`, `FleetPage` y `ForkliftDetail`, pasándola como 3er parámetro a `computeFleetAvailability`. En `EquipmentListView` eliminar el cálculo local y los imports que queden sin uso.
5. **CRM `stage_order`**: migración que primero **normaliza los 2 duplicados existentes** (renumerar por `stage_order, created_at`) y luego añade `UNIQUE (stage, stage_order)`. En `useProspectMutations`, un reintento único ante error `23505`.
6. **Auto-match bancario**: migración que redefine `match_bank_statement_lines` comparando el monto convertido por `exchange_rate` cuando la moneda difiere, excluyendo pagos sin TC válido — la misma regla que ya usan `get_bank_match_candidates` y `matchingScore.ts`. Aplica a `payments` y `supplier_payments`. Más un test SQL en `supabase/tests/`.

## Notas técnicas

- Las migraciones seguirán las reglas permanentes: `SET search_path = public`, guards de rol en `SECURITY DEFINER`, sin `USING (true)`.
- La opción 6b del documento (RPC `create_prospect_with_order`) no la tomo: la 6a resuelve la carrera con menos cambio y sin tocar la firma del hook.
- Verificación final: typecheck, pruebas unitarias, `test:rls`, y revisión visual de los 2 diálogos.
- Versión sugerida: **v7.319.0** (minor: cambia comportamiento de conciliación y añade constraint), con entrada en el changelog.
