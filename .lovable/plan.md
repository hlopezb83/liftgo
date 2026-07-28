## Validación previa (lo que sí verifiqué en el código)

- `FormDialog` acepta `isDirty` (línea 45/58) y **ningún** consumidor se lo pasa → R22-A vigente.
- Solo `ProfitabilityByModelReport.tsx` maneja `isError`; los demás reportes no → R22-B vigente.
- `table.tsx:50` sigue con `even:bg-muted/30` duplicando la zebra de `DataTableBodyV2` → R22-D vigente.
- `formatCompactCurrency`/`kpiSizeClass` existen en `src/lib/format/formatCurrency.ts` con un solo uso (PortalDashboard) → R22-K/L vigentes.
- `index.css` tiene reglas `[data-app-header]` y `.no-print`, pero ningún elemento lleva esos atributos → R22-J vigente.
- `useUpdateQuote` invalida solo `lists()` → R22-I vigente.
- `PortalLogin` usa `notifyError({ error })` (mensaje del backend en inglés) → R22-M vigente.
- `PageTransition` usa `animate-fade-in`, que no está definido en `index.css` → R22-P vigente.
- **R22-G ya está corregido**: `FormActions` ya renderiza Cancelar a la izquierda y la primaria a la derecha. Lo omito.

## Qué haré

### Altos
1. **R22-A** — pasar `isDirty` a todos los `FormDialog` de formularios con más de un campo (Cliente, Refacción, Proveedor + contactos/cuentas, SupplierBill, Prospecto, Registrar Pago, Reportar Daño, Mantenimiento, Cuenta Bancaria, Inspección de devolución). En los que usan React Hook Form sale de `form.formState.isDirty`; en los de estado local (Prospecto, Registrar Pago) se deriva comparando contra el estado inicial. Excluyo diálogos de confirmación y de un solo campo.
2. **R22-B** — añadir `QueryErrorState` con reintento a los reportes sin manejo de error (Utilización, Utilización por modelo, Ingresos, Costos de mantenimiento, Antigüedad de saldos, Estado de resultados), para que nunca muestren “Sin datos” ni exporten CSV vacío cuando falla la red.

### Medios
3. **R22-C** Calendario: el reintento también refresca montacargas.
4. **R22-D** Quitar `even:bg-muted/30` de `TableRow`; la zebra queda como única fuente en DataTableV2.
5. **R22-E / R22-F** `meta: { kind: "money" }` en “Costo Est.” (Daños) y “Costo” (OTs).
6. **R22-H** Prospecto: quitar validación nativa (`required` + `noValidate`) y mostrar el mensaje Zod en español bajo el campo.
7. **R22-I** `useUpdateQuote` invalida también el detalle de la cotización.
8. **R22-J** Impresión: marcar headers/nav de app y portal con `data-app-header` y añadir `no-print` a toolbars, paginadores y botones de acción de las vistas imprimibles.
9. **R22-K** `KpiTile` sin truncar el número; usar `formatCompactCurrency` + tooltip con el valor exacto en los KPIs de montos grandes (Panel, CxP, portal, flujo de efectivo).
10. **R22-L** Eje Y de Costos de mantenimiento con formato compacto ($60 K).
11. **R22-M** Error de login del portal en español.
12. **R22-N** Copy de botones/títulos a sentence case en las 8 vistas listadas + barrido.

### Bajos
13. R22-O etiquetas es-MX de `cfdi_status`/`cancellation_status` en auditoría · R22-P definir `fade-in` en `index.css` · R22-Q branding no se corta con sidebar colapsado · R22-R/S contraste y leyenda del Gantt · R22-T “Eliminar” → “Archivar” en cliente · R22-U tabla del portal con el `Table` del sistema · R22-V `DetailRow` con `div` en vez de `p` · R22-W nulos siempre al final al ordenar.

No aplico los “PENDIENTES” (C-1, C-2, B-8, B-11, B-3): son sprints grandes y quedan re-agendados.

## Detalles técnicos

- Cambios exclusivamente de presentación y manejo de errores; no se toca lógica de negocio, dinero ni RLS.
- Tests: unitarios nuevos para el orden de nulos (`sorting.ts`), los formatters de auditoría y el mensaje de login; los tests existentes de tablas/KPIs se ajustan si la zebra o el truncate rompen aserciones.
- Verificación visual con Playwright en: modal de cliente (descartar cambios), reportes offline, tabla de daños/OTs, Ctrl+P en Clientes y portal.
- Changelog: entrada **v7.249.0** (minor) en `public/changelog.json` + `public/changelog/v7.249.0.json`.
