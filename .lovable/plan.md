

## Plan de Refactorizacion del Codigo - Por Fases

Este plan organiza todas las mejoras encontradas en fases priorizadas, de mayor a menor impacto.

---

### Fase 1: Consolidar codigo duplicado de generacion de PDF

**Problema encontrado:** Los tres componentes PDF (`InvoicePDFButton`, `QuotePDFButton`, `ContractPDFButton`) repiten bloques identicos de codigo:
- Carga de datos de empresa y logo (identico en los 3)
- Header del PDF con logo, nombre de empresa, RFC (identico en `InvoicePDFButton` y `QuotePDFButton`, similar en `ContractPDFButton`)
- Tabla de line items con encabezado, filas y formato MXN (identico en Invoice y Quote)
- Bloque de totales (subtotal, IVA, total) -- identico en Invoice y Quote
- Bloque de notas al final -- identico en Invoice y Quote

**Solucion:** Crear un archivo `src/lib/pdfHelpers.ts` con funciones reutilizables:
- `fetchCompanyDataAndLogo()` -- carga datos de empresa y logo base64
- `drawPdfHeader(doc, company, logo, title, identifier)` -- dibuja header con logo
- `drawLineItemsTable(doc, lineItems, y)` -- dibuja tabla de partidas
- `drawTotalsBlock(doc, subtotal, taxRate, taxAmount, total, currency)` -- dibuja totales
- `drawNotesBlock(doc, notes, y)` -- dibuja notas
- `fmtMXN(n)` -- formateador de moneda (duplicado en los 3 archivos)

**Archivos afectados:** 3 componentes PDF + 1 archivo nuevo

---

### Fase 2: Renombrar variables con nombres poco descriptivos

**Variables con nombres ambiguos encontrados:**

| Archivo | Variable actual | Nombre propuesto |
|---------|----------------|------------------|
| PDF buttons | `pw` | `pageWidth` |
| PDF buttons | `mg` | `margin` |
| PDF buttons | `y` | `cursorY` |
| `useForklifts.ts` | `qc` | `queryClient` |
| `useBookings.ts` | `qc` | `queryClient` |
| `useInvoices.ts` | `qc` | `queryClient` |
| `useQuotes.ts` | `qc` | `queryClient` |
| `ContractForm.tsx` | `set` (funcion) | `updateField` |
| `ContractForm.tsx` | `fl` | `forklift` |
| `InvoiceForm.tsx` | `bId` | `bookingId` |
| `InvoiceForm.tsx` | `cId` | `customerId` |
| `QuoteForm.tsx` | `fid` | `forkliftId` |
| `QuoteForm.tsx` | `fl` | `forklift` |
| `CalendarPage.tsx` | `b` (en maps/filters) | `booking` |
| `invoiceUtils.ts` | `dr`, `wr`, `mr` | `dailyRate`, `weeklyRate`, `monthlyRate` |

**Archivos afectados:** ~12 archivos

---

### Fase 3: Extraer patron repetido de paginas de listado con dialogo

**Problema encontrado:** `MaintenancePage`, `DeliveriesPage`, y `ReturnInspectionPage` siguen un patron casi identico:
1. Hook de datos + `useSort` + `usePagination` + `useIsMobile`
2. Variable `mobileContent` con `MobileCardList`
3. Componente `ListPageLayout` con la misma estructura
4. `Dialog` con formulario de creacion
5. Dialogo post-accion opcional

Cada pagina repite ~30 lineas de boilerplate para configurar sort, paginacion y mobile content.

**Solucion:** No es necesario un componente abstracto (ya existe `ListPageLayout`), pero se puede:
- Crear un hook `useListPage(data, sortAccessors)` que combine `useSort` + `usePagination` + `useIsMobile` en una sola llamada, reduciendo ~15 lineas por pagina.

**Archivos afectados:** 5 paginas de listado + 1 hook nuevo

---

### Fase 4: Simplificar el manejo de estado del formulario de facturas

**Problema encontrado:** `InvoiceForm.tsx` tiene 21 llamadas a `useState` individuales para campos CFDI. Esto es excesivo y dificulta la lectura.

**Solucion:** Consolidar todos los campos CFDI en un solo objeto de estado usando el hook `useFormState` que ya existe en el proyecto:

```text
Antes: 21 useState separados
Despues: 1 useFormState con un objeto de 21 propiedades
```

Esto tambien elimina el patron `handleCfdiUpdate` con el mapa de setters (lineas 183-191), reemplazandolo por `set("campo", valor)`.

**Archivos afectados:** `InvoiceForm.tsx`

---

### Fase 5: Extraer tarjeta de Notas reutilizable de las paginas de detalle

**Problema encontrado:** El bloque de "Notas" (Card con CardHeader "Notas" + CardContent con texto) se repite identico en:
- `ForkliftDetail.tsx` (lineas 78-83)
- `InvoiceDetail.tsx` (lineas 234-238)
- `QuoteDetail.tsx` (lineas 268-273)
- `CustomerDetailPage.tsx` (lineas 139-144)

**Solucion:** Ya existe un componente `NotesCard` pero solo se usa en formularios (acepta `value` y `onChange`). Crear una variante de solo lectura o agregar un prop `readOnly` al `NotesCard` existente para mostrar notas sin edicion.

**Archivos afectados:** `NotesCard.tsx` + 4 paginas de detalle

---

### Fase 6: Eliminar codigo no utilizado

**Elementos a revisar y limpiar:**
- `PageTransition.tsx`: solo se usa en `CalendarPage.tsx`. Verificar si agrega valor o si se puede eliminar el wrapper.
- Importaciones no usadas (revisar con el linter):
  - `InvoiceDetail.tsx` importa `Printer` de lucide pero solo lo usa dentro de un menu -- verificar que no haya otros iconos sin uso.
  - `ContractForm.tsx` importa `Button` pero usa `FormActions` -- verificar si es redundante (lo usa en el footer, asi que no es redundante).
  
**Archivos afectados:** Revision de ~5 archivos

---

### Fase 7: Consolidar `ContractPDFButton.tsx` (571 lineas)

**Problema encontrado:** Este es el archivo mas largo del proyecto con 571 lineas. Contiene:
- Datos hardcoded de clausulas default (~100 lineas)
- 4 funciones de generacion de paginas PDF (contrato, checklist, pagare)
- Logica de fetch de datos
- Componente de UI con dropdown

**Solucion:** Dividir en:
- `src/lib/contractPdfData.ts` -- constantes default (clausulas, checklist, pagare)
- `src/lib/contractPdfGenerator.ts` -- funciones de generacion de paginas PDF
- `ContractPDFButton.tsx` -- solo el componente de UI (boton + dropdown)

**Archivos afectados:** 1 archivo dividido en 3

---

### Resumen de impacto

| Fase | Archivos modificados | Archivos nuevos | Lineas reducidas (aprox) |
|------|---------------------|-----------------|--------------------------|
| 1 | 3 | 1 | ~120 |
| 2 | 12 | 0 | 0 (solo renombrar) |
| 3 | 5 | 1 | ~75 |
| 4 | 1 | 0 | ~30 |
| 5 | 5 | 0 | ~20 |
| 6 | ~5 | 0 | ~10 |
| 7 | 1 | 2 | 0 (reorganizar) |
| **Total** | **~30** | **4** | **~255** |

Cada fase es independiente y se puede implementar en orden sin romper funcionalidad existente.

