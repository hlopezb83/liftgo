## Contexto (verificado en el código actual)

Revisé cada hallazgo del R24 contra el repo. Los 7 son reales hoy:

- `CRMPage.tsx:160-162` pasa `mutate` (fire-and-forget) al diálogo, que hace `await onSave(...)` → cierra antes de que termine el guardado.
- `src/hooks/use-mobile.tsx` no considera impresión: al imprimir, el page box (<768px) activa la vista de tarjetas móviles.
- `.no-print` existe en `index.css:327` pero **ningún componente la usa**.
- `AccountsPayableKpiCards.tsx` usa `formatCurrency` (no compacto) y `kpiSizeClass` topa en `text-lg`.
- La migración `20260729012353` desempata siempre a favor de la tarjeta movida (correcto al subir, incorrecto al bajar).
- `csvParsers.ts` sólo valida columnas de menos, no de más.
- `resolveDropTarget.ts` inserta antes de la última tarjeta al soltar en su franja inferior.

---

## Qué se va a hacer

### 1. R24-C — Guardado del prospecto realmente esperado (ALTO)
- En `CRMPage.tsx`, pasar `mutateAsync` en `onCreate`/`onUpdate`/`onDelete` para que el modal cierre sólo cuando el servidor responde.
- Asegurar toast de error propio en la mutación de crear prospecto ("No se pudo crear el prospecto").
- Barrido rápido del mismo patrón (`mutate` pasado a diálogos que hacen `await`) en `src/features`; corregir los que aparezcan.

### 2. R24-A — Los 4 footers que saltan el "¿Descartar cambios?" (ALTO)
Migrar a `FormActions` o, donde el layout sea especial, usar `useFormDialogClose()` en el botón Cancelar:
- `inventory/PartFormDialog.tsx`
- `crm/components/prospect-form/ProspectDialogParts.tsx` (footer de `ProspectFormDialog`)
- `damage/ReportDamageDialog.tsx`
- `invoices/RecordPaymentDialog.tsx`

### 3. R24-B / R24-H — Impresión (ALTO)
- `use-mobile.tsx`: `useIsMobile` y `useIsTabletOrBelow` devuelven `false` durante impresión (`useMediaQuery("print")`), para que las listas impriman la **tabla** completa y no las tarjetas paginadas.
- Aplicar `no-print` en puntos centrales: `ListToolbar` (buscador + acciones), paginación de `DataTableV2`, menú/avatar de usuario del header, FAB de feedback y los controles del estado de cuenta del portal (Descargar PDF, Pagar, switch "Solo con saldo", chevrons).

### 4. R24-D — KPI de Cuentas por Pagar (ALTO)
- Usar `formatCompactCurrency` en el monto, con `title` mostrando el importe exacto al hover.
- Añadir un escalón a `kpiSizeClass`: `>14 → text-base`, `>12 → text-lg`.

### 5. R24-E — Reorden descendente en la misma columna (MEDIO, base de datos)
Nueva migración que recrea `reorder_prospect_stage` capturando el `stage_order` original y desempatando según la dirección del movimiento (al bajar, la tarjeta movida va después de los empates). Mover A al final de [A,B,C] queda como [B,C,A] tras recargar.

### 6. R24-F — CSV con columnas de más (MEDIO)
`parseRow` recibe también `maxCols` y rechaza filas con más columnas de las esperadas, con mensaje de fila claro.

### 7. R24-G — Soltar bajo la última tarjeta (BAJO)
Ajustar `resolveDropTarget` para que, cuando el puntero cae en la mitad inferior de la última tarjeta, el índice sea `index + 1` (va al final).

---

## Pruebas
- Unitarias nuevas/ajustadas: `kpiSizeClass` (escalón nuevo), `csvParsers` (fila con columnas de más), `resolveDropTarget` (drop en mitad inferior de la última card).
- Ejecutar las suites de `crm`, `bank-reconciliation`, `accounts-payable` e `invoices`, más `tsgo` y lint.
- Verificación manual de impresión (Ctrl+P en `/customers` e `/invoices`) documentada en el changelog.

## Notas técnicas
- Ningún cambio toca cálculos de dinero ni reglas de negocio; el único cambio de datos es el desempate del reorden del kanban.
- Se agrega la entrada de changelog correspondiente (`public/changelog.json` + `public/changelog/v7.257.0.json`) y se sincroniza `package.json` / `public/version.json`. Versión propuesta: **7.257.0** (minor: cambios de comportamiento visible + migración).
