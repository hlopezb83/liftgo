
# Plan de Refactorizacion de LiftGo ERP

## Resumen Ejecutivo

Despues de revisar las ~35 paginas, ~40 componentes, ~30 hooks y ~11 utilidades del proyecto, identifique patrones de codigo repetido, componentes demasiado largos y oportunidades de consolidacion. El codigo ya sigue buenas practicas (lazy loading, hooks reutilizables, `ListPageLayout`, `useFormState`), pero hay margenes claros de mejora.

---

## Fase 1: Eliminar codigo muerto y simplificar tipos

**Archivos afectados:** `src/lib/types.ts`

- `src/lib/types.ts` solo contiene `export type Invoice = Tables<"invoices">` con un comentario. Este alias no agrega valor ya que `Tables<"invoices">` se puede usar directamente. Verificar si se importa en algun lugar; si no, eliminar el archivo.

---

## Fase 2: Extraer componentes de las paginas Detail (260+ lineas)

**Problema:** `ForkliftDetail.tsx` (262 lineas), `InvoiceDetail.tsx` (348 lineas) y `CustomerDetailPage.tsx` (227 lineas) son monoliticas con multiples secciones de Card repetidas.

**Solucion:**

### ForkliftDetail.tsx
Extraer a `src/components/forklift-detail/`:
- `ForkliftSpecsCard` -- tabla de especificaciones
- `ForkliftRatesCard` -- tarifas de renta
- `ForkliftBookingsList` -- lista de reservas (patron repetido con CustomerDetailPage)
- `ForkliftMaintenanceList` -- historial de mantenimiento
- `ForkliftStatusHistory` -- historial de estado
- `StatusChangeCard` -- formulario para cambiar estado

### InvoiceDetail.tsx
Extraer a `src/components/invoice-detail/`:
- `InvoiceActionBar` -- botones de estado y acciones (logica compleja de 50+ lineas)
- `InvoiceFiscalDataCard` -- datos fiscales CFDI
- `InvoicePaymentSummary` -- resumen y tabla de pagos
- `CancelCfdiDialog` -- dialogo de cancelacion (actualmente inline)

### CustomerDetailPage.tsx
Extraer a `src/components/customer-detail/`:
- `CustomerContactCard` -- informacion de contacto
- `CustomerFinancialSummary` -- resumen financiero
- `CustomerBookingHistory` -- historial de reservas (mismo patron que ForkliftDetail)
- `CustomerInvoiceHistory` -- facturas del cliente
- `InvitePortalDialog` -- dialogo de invitacion (actualmente inline)

---

## Fase 3: Extraer secciones del InvoiceForm (380 lineas)

**Problema:** `InvoiceForm.tsx` tiene 380 lineas con 15+ estados individuales y multiples secciones de formulario.

**Solucion:**
- Extraer `CfdiFieldsCard` -- campos CFDI 4.0 (lineas 208-288) con ~12 campos de formulario
- Extraer `LineItemsTable` -- tabla editable de partidas (lineas 290-352) con logica de agregar/eliminar filas
- Extraer `InvoiceTotalsCard` -- calculo y display de subtotal/IVA/total (lineas 354-372)
- Considerar consolidar los 15 `useState` en un solo objeto con `useFormState` (como ya hacen `ForkliftForm`, `ContractForm`, etc.)

---

## Fase 4: Consolidar patrones de contenido mobile repetido

**Problema:** 6 paginas (`Fleet`, `BookingsPage`, `InvoicesPage`, `CustomersPage`, `MaintenancePage`, `DeliveriesPage`, `ReturnInspectionPage`) implementan el patron `mobileContent` de forma casi identica: un bloque condicional `isMobile ? (tarjetas con Card) : undefined`.

**Solucion:**
Crear un componente `MobileCardList<T>`:

```text
MobileCardList<T>
  Props:
    items: T[]
    renderCard: (item: T) => ReactNode
    emptyMessage: string

  Logica:
    if items.length === 0 -> mostrar Card con emptyMessage
    else -> map items con renderCard
```

Cada pagina solo pasa `renderCard` con el contenido especifico de su tarjeta. Esto elimina ~15-20 lineas duplicadas por pagina.

---

## Fase 5: Consolidar `forkliftMap` duplicado

**Problema:** El patron `const forkliftMap = new Map(forklifts?.map(f => [f.id, f]))` se repite en 4 archivos: `MaintenancePage`, `DeliveriesPage`, `ReturnInspectionPage`, y `MaintenanceCostReport`.

**Solucion:**
Crear un hook `useForkliftMap()`:

```text
useForkliftMap()
  Retorna: Map<string, Forklift>
  Internamente usa useForklifts() y useMemo()
```

---

## Fase 6: Consolidar la tabla de LineItems de solo lectura

**Problema:** `InvoiceDetail` y `QuoteDetail` tienen tablas identicas de partidas (Descripcion, Cant., Precio Unit., Total) con el mismo markup.

**Solucion:**
Crear `ReadOnlyLineItemsTable`:

```text
ReadOnlyLineItemsTable
  Props: lineItems: LineItem[]
  Renderiza: Table con headers y rows formateados
```

---

## Fase 7: Consolidar el patron Detail Page Header

**Problema:** Todas las paginas de detalle (`ForkliftDetail`, `InvoiceDetail`, `ContractDetail`, `QuoteDetail`, `CustomerDetailPage`) implementan el mismo patron de header con boton de regreso, titulo, badges y acciones. Son 15-25 lineas duplicadas cada vez.

**Solucion:**
Crear `DetailPageHeader`:

```text
DetailPageHeader
  Props:
    title: string
    subtitle?: string
    badges?: ReactNode
    backTo: string
    actions?: ReactNode
```

---

## Fase 8: Unificar busqueda en Fleet y Customers

**Problema:** `Fleet.tsx` y `CustomersPage.tsx` implementan su propio campo de busqueda con el icono Search inline, en lugar de usar el componente `SearchBar` que ya existe y que usan otras paginas.

**Solucion:** Reemplazar los inputs de busqueda manuales con `<SearchBar />` para consistencia.

---

## Fase 9: Consolidar `TotalsSummary` y duplicacion en `InvoiceForm`

**Problema:** El bloque de totales en `InvoiceForm` (lineas 354-372) es practicamente identico al componente `TotalsSummary` que ya existe, excepto que el de InvoiceForm permite editar el IVA. Tambien `CostSummaryCard` tiene un layout similar.

**Solucion:**
Extender `TotalsSummary` con una prop opcional `editableTaxRate`:

```text
TotalsSummary
  Props existentes: subtotal, taxRate, taxAmount, total
  Nueva prop: onTaxRateChange?: (rate: number) => void
  Si onTaxRateChange existe, mostrar Input editable para IVA
```

---

## Orden de Ejecucion Recomendado

| Orden | Fase | Impacto | Riesgo |
|-------|------|---------|--------|
| 1 | Fase 1 | Bajo | Minimo |
| 2 | Fase 5 | Medio | Bajo |
| 3 | Fase 8 | Bajo | Minimo |
| 4 | Fase 6 | Medio | Bajo |
| 5 | Fase 7 | Alto | Bajo |
| 6 | Fase 4 | Alto | Medio |
| 7 | Fase 9 | Medio | Bajo |
| 8 | Fase 2 | Alto | Medio |
| 9 | Fase 3 | Alto | Medio |

Las fases estan ordenadas de menor a mayor riesgo. Las primeras son cambios simples y seguros, las ultimas requieren mas cuidado para no romper funcionalidad existente.

## Notas

- No se encontraron variables o funciones con nombres poco claros. Los nombres actuales son descriptivos y consistentes.
- La arquitectura general (hooks de datos, componentes compartidos, lazy loading) esta bien disenada.
- No se encontraron imports no utilizados significativos -- el tree-shaking de Vite ya los maneja.
