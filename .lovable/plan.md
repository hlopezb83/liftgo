# B-8 · Conciliación Bancaria: cómo lo mejoraría

El plan original de B-8 solo pedía "dos columnas". Al revisar el módulo encontré que el layout es el síntoma; los frenos reales están en el flujo de emparejamiento. Propongo atacar ambos.

## Diagnóstico del estado actual

Verificado leyendo `BankReconciliationPage.tsx`, `BankStatementLinesTable.tsx`, `BankLineDetailSheet.tsx`, `BankLineActions.tsx`, `ManualMatchPicker.tsx`, `useManualMatchCandidates.ts` y `matchingScore.ts`:

1. **Página apilada verticalmente**: uploader + KPIs + hasta 4 tablas (Sin emparejar / Sugeridas / Conciliadas / Ignoradas) una debajo de otra. Con un estado de cuenta de 200 líneas hay que hacer scroll largo y nunca se ven banco y sistema al mismo tiempo.
2. **Candidatos manuales pobres**: `useManualMatchCandidates` trae los **20 pagos más recientes**, sin filtrar por monto, fecha ni cuenta bancaria, y luego filtra en el cliente. Si el pago que buscas es el número 21, simplemente no aparece. Este es el bug funcional más grave del módulo.
3. **Un movimiento a la vez**: cada línea abre un `Sheet` que se cierra al confirmar. Conciliar 50 líneas = 50 aperturas/cierres.
4. **Sin acciones masivas**: no se puede "confirmar todas las sugerencias con score ≥ 85" ni ignorar varias comisiones bancarias juntas.
5. **Sin filtros ni paginación**: las tablas usan `paginated: false` y no hay búsqueda por monto/descripción/rango de fechas ni filtro por importación.
6. **Score opaco**: se muestra "Score: 92" sin explicar por qué (monto exacto, ±1 día, referencia coincide).
7. **Moneda**: los KPIs usan `formatCurrency` por defecto aunque la cuenta bancaria tenga `currency` propia (USD).
8. **Salida limitada para no conciliados**: solo "Ignorar". No hay atajo para crear el gasto o pago faltante desde la línea.

## Rediseño propuesto

### Fase 1 · Workspace de dos columnas (el B-8 original)

```text
┌──────────────────────────────────────────────────────────────┐
│ Cuenta ▾   Importación ▾   Periodo ▾   Buscar…   [Subir CSV] │
│ Cargos $X · Abonos $Y · Neto $Z · 62% conciliado ▓▓▓▓▓░░░    │
├─────────────────────────┬────────────────────────────────────┤
│ MOVIMIENTOS DEL BANCO   │  PANEL DE EMPAREJAMIENTO           │
│ [Pendientes][Sug.][OK]  │  Línea seleccionada (banco)        │
│ ☐ 12/07 OXXO   -$1,200  │  ────────  ⇅  ────────             │
│ ☑ 13/07 SPEI   +$45,000 │  Candidatos del sistema            │
│ ☐ 14/07 COMIS.    -$85  │  · Score 92 · monto ✓ fecha ✓ ref ✓│
│ …                       │  [Confirmar] [Ignorar] [Crear…]    │
├─────────────────────────┴────────────────────────────────────┤
│ 3 seleccionadas · [Confirmar sugeridas] [Ignorar] [Limpiar]  │
└──────────────────────────────────────────────────────────────┘
```

- Columna izquierda: **una sola tabla** con pestañas de estado (`StatusTabs`, ya estándar en la app) en lugar de 4 tablas apiladas. Selección de fila persistente y resaltada.
- Columna derecha: panel **fijo** (sticky) que reemplaza al `Sheet`. Al hacer clic en otra línea, el panel cambia sin animación de apertura/cierre. En móvil sigue siendo `Sheet`.
- Barra superior sticky con cuenta, importación, periodo y búsqueda; KPIs compactos con barra de progreso de conciliación.

### Fase 2 · Candidatos inteligentes (el arreglo funcional)

Reescribir `useManualMatchCandidates` para que reciba la línea seleccionada y consulte del backend:
- pagos con monto dentro de una tolerancia configurable (exacto, ±1%, o cualquier monto),
- ventana de fechas ±15 días alrededor de `posted_date`,
- búsqueda por texto en referencia/cliente/proveedor **en el servidor**,
- excluyendo pagos ya conciliados con otra línea.

Cada candidato muestra su score calculado con `computeMatchScore` (ya existe y está testeado) y un desglose visual: `monto exacto ✓ · 1 día de diferencia · referencia coincide`.

### Fase 3 · Productividad

- **Selección múltiple** en la tabla (`enableRowSelection` de `DataTableV2`, ya soportado) con toolbar de acciones masivas: *Confirmar sugeridas seleccionadas* e *Ignorar con razón común*.
- **Confirmar todas las de alta confianza**: un botón que empareja de golpe las sugerencias con score ≥ 85, con diálogo de confirmación que enumera cuántas y por qué monto total.
- **Teclado**: `↑/↓` mueve de línea, `Enter` confirma la sugerencia, `I` ignora. Registrado en el registry de atajos existente.
- **Crear desde la línea**: para cargos sin match, botón *Registrar gasto* que abre el formulario de gastos prellenado con fecha, monto y descripción de la línea.

## Detalles técnicos

- Nuevo `BankReconciliationWorkspace.tsx` que contiene el grid `lg:grid-cols-[minmax(0,1fr)_420px]`; `BankReconciliationPage.tsx` queda como shell (cuenta + guard + carga).
- `BankLineDetailSheet` se refactoriza a `BankLineMatchPanel` (contenido puro) reutilizado tanto por el panel fijo en escritorio como por el `Sheet` en móvil, respetando el límite de 150 líneas por componente.
- Candidatos: nueva RPC `get_bank_match_candidates(line_id, tolerance, search)` con `SET search_path = public` y `SECURITY INVOKER` para respetar RLS; devuelve como máximo 50 filas ordenadas por score.
- Acciones masivas sobre una RPC transaccional `confirm_bank_matches(line_ids[], ...)` para mantener integridad (patrón ya usado en el proyecto).
- KPIs: pasar `currency` de la cuenta a `formatCurrencyWithCode`.
- Pruebas: unitarias del desglose de score y del filtrado de candidatos; E2E de conciliar una línea sugerida y una manual.

## Orden y esfuerzo

| Fase | Contenido | Riesgo |
|---|---|---|
| 1 | Layout dos columnas + tabs + panel fijo | Bajo (solo UI) |
| 2 | RPC de candidatos + desglose de score | Medio (toca backend) |
| 3 | Selección múltiple, masivas, teclado, crear gasto | Medio |

Recomiendo entregar la Fase 1 sola primero (v7.246.0) para validar el layout con datos reales, y luego 2 y 3.

## Fuera de alcance

- Conexión bancaria automática por API (Belvo/Plaid): distinto proyecto.
- Reglas de auto-ignorado aprendidas (por ejemplo, comisiones recurrentes): candidato para una oleada posterior.

## Pregunta antes de arrancar

¿Entrego **solo la Fase 1** (layout, sin tocar backend) o el **paquete completo Fases 1–3**?
