
# Plan de Refactorizacion — Fase 2

## Resumen

Despues de revisar toda la aplicacion a fondo, encontre varias areas adicionales que se pueden mejorar. Las organizo por categoria.

---

## 1. Fechas en ingles: usar locale `es` en todos los `format()`

**Problema**: Hay ~15 lugares donde se usa `format(date, "MMM d, yyyy")` sin locale, lo cual muestra meses en ingles ("Jan", "Feb", etc.).

**Archivos afectados**:
- `src/pages/ForkliftDetail.tsx` (3 instancias)
- `src/pages/CalendarPage.tsx` (4 instancias)
- `src/pages/ActivityPage.tsx` (1 instancia)
- `src/pages/ReturnInspectionPage.tsx` (1 instancia)
- `src/components/DateRangePickerField.tsx` (2 instancias)

**Solucion**: Agregar `import { es } from "date-fns/locale"` y usar `{ locale: es }` en cada llamada a `format()`. Cambiar formato de `"MMM d, yyyy"` a `"d MMM yyyy"` para seguir el estandar en espanol (ej: "23 feb 2026").

---

## 2. Traducir constantes pendientes en ingles

**Problema**: Hay valores que se muestran tal cual al usuario y estan en ingles.

- `FUEL_TYPES`: "Diesel", "Electric", "LPG", "Gasoline" -- se muestran directamente en Fleet, ForkliftForm y ForkliftDetail
- `FUEL_LEVELS`: "Full", "3/4", "1/2", "1/4", "Empty" -- se muestran en ReturnInspectionPage
- `OperationsSetupPage.tsx` linea 101: lista hardcodeada `["Diesel", "Electric", "LPG", "Gasoline"]` en vez de usar la constante

**Solucion**: Crear un mapa `FUEL_TYPE_LABELS` y `FUEL_LEVEL_LABELS` en `constants.ts`. Usarlos en las vistas. Los valores internos siguen en ingles (para compatibilidad con la base de datos), pero las etiquetas visibles se traducen.

---

## 3. Eliminar casteos `as any` restantes

**Problema**: Quedan ~50 casteos `as any` en el codigo, la mayoria en hooks que acceden a tablas no reconocidas por el tipo autogenerado (contracts, payments, audit_logs) y en InvoiceDetail/InvoicePDFButton para campos CFDI.

**Archivos con mas impacto**:
- `src/hooks/useContracts.ts`: 5 casteos `.from("contracts" as any)`
- `src/hooks/usePayments.ts`: 4 casteos `.from("payments" as any)`
- `src/hooks/useAuditLogs.ts`: 1 casteo `.from("audit_logs" as any)`
- `src/pages/InvoiceDetail.tsx`: `invoice as any` para acceder a campos CFDI
- `src/pages/InvoiceForm.tsx`: `payload as any` en mutaciones

**Solucion**: Estos casteos existen porque las tablas fueron agregadas despues del tipo autogenerado. La solucion correcta es extender los tipos localmente con interfaces `Contract`, `Payment`, `AuditLog` bien tipadas y usar generics en los hooks. Para InvoiceDetail, crear un tipo `InvoiceWithCfdi` que extienda el tipo base.

---

## 4. Migrar paginas restantes a `ListPageLayout` y `SearchBar`

**Problema**: Solo DamageTrackingPage y QuotesPage usan los componentes reutilizables nuevos. Las demas paginas de listado (Fleet, ContractsPage, InvoicesPage, MaintenancePage, AuditTrailPage) siguen con el patron manual.

**Archivos a simplificar**:
- `src/pages/Fleet.tsx` -- tiene vista mobile y desktop, usar `customContent` para mobile
- `src/pages/ContractsPage.tsx` -- tiene vista mobile y desktop, mismo patron
- `src/pages/InvoicesPage.tsx` -- tiene vista mobile y desktop
- `src/pages/MaintenancePage.tsx` -- solo desktop
- `src/pages/AuditTrailPage.tsx` -- solo desktop

**Nota**: No todas las paginas son candidatas. DeliveriesPage y ReturnInspectionPage tienen formularios integrados (dialogs), asi que el ahorro seria minimo. Se dejan como estan.

---

## 5. Extraer tabs de OperationsSetupPage a archivos separados

**Problema**: `OperationsSetupPage.tsx` tiene 324 lineas con 3 componentes internos (EquipmentModelsTab, DriversTab, MechanicsTab) que siguen un patron identico de CRUD con tabla + dialog. Los 3 comparten la misma estructura.

**Solucion**: Extraer cada tab a su propio archivo:
- `src/components/operations/EquipmentModelsTab.tsx`
- `src/components/operations/DriversTab.tsx`
- `src/components/operations/MechanicsTab.tsx`

Esto reduce OperationsSetupPage a ~30 lineas.

---

## 6. Traducir condiciones de inspeccion en ReturnInspectionPage

**Problema**: En linea 179, las condiciones se muestran con `{c.replace(/_/g, " ")}` que deja el texto en ingles ("good", "minor damage"). STATUS_LABELS ya tiene las traducciones.

**Solucion**: Usar `STATUS_LABELS[c] || c` en vez del replace.

---

## Orden de implementacion

1. Fechas con locale `es` (5 archivos, bajo riesgo)
2. Traducir FUEL_TYPES, FUEL_LEVELS, condiciones de inspeccion (constantes + 3 archivos)
3. Eliminar `as any` con tipos locales (hooks + 2 paginas)
4. Extraer tabs de OperationsSetupPage (1 archivo -> 4 archivos)
5. Migrar paginas restantes a ListPageLayout (5 archivos)

---

## Seccion tecnica

### Tipos locales para eliminar `as any`

```text
// En useContracts.ts - ya tiene interface Contract, 
// solo falta usar tipo generico en .from()
// Solucion: supabase.from("contracts").select(...) 
// con casteo en el resultado, no en .from()

// En usePayments.ts
interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

// En InvoiceDetail.tsx
interface InvoiceWithCfdi extends Invoice {
  serie?: string;
  folio?: string;
  forma_pago?: string;
  metodo_pago?: string;
  uso_cfdi?: string;
  moneda?: string;
  tipo_cambio?: number;
  receptor_rfc?: string;
  receptor_razon_social?: string;
  receptor_regimen_fiscal?: string;
  receptor_domicilio_fiscal_cp?: string;
  cfdi_status?: string;
  cfdi_uuid?: string;
  cfdi_xml?: string;
}
```

### Mapa de traducciones de combustible

```text
// En constants.ts
export const FUEL_TYPE_LABELS: Record<string, string> = {
  Diesel: "Diésel",
  Electric: "Eléctrico",
  LPG: "Gas LP",
  Gasoline: "Gasolina",
};

export const FUEL_LEVEL_LABELS: Record<string, string> = {
  Full: "Lleno",
  "3/4": "3/4",
  "1/2": "1/2",
  "1/4": "1/4",
  Empty: "Vacío",
};
```
