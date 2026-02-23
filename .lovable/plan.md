
# Plan de Refactorizacion — Fase 3

## Resumen

Despues de las Fases 1 y 2, quedan areas con casteos `as any` sin resolver, textos en ingles en el PDF, y oportunidades para mejorar la organizacion del codigo.

---

## 1. Eliminar `as any` en InvoiceDetail e InvoicePDFButton

**Problema**: `InvoiceDetail.tsx` usa `const inv = invoice as any` para acceder a campos CFDI (serie, folio, cfdi_uuid, receptor_rfc, etc.). Lo mismo pasa en `InvoicePDFButton.tsx`.

**Solucion**: Crear una interfaz `InvoiceWithCfdi` que extienda el tipo base de Invoice con los campos CFDI, y usarla en ambos archivos.

**Archivos nuevos**:
- `src/lib/types.ts` — tipo `InvoiceWithCfdi` centralizado

**Archivos modificados**:
- `src/pages/InvoiceDetail.tsx` — reemplazar `invoice as any` con tipo correcto
- `src/components/InvoicePDFButton.tsx` — reemplazar `invoice as any` con tipo correcto

---

## 2. Eliminar `as any` restantes en useContracts

**Problema**: `useContracts.ts` aun tiene casteos `as any` en las lineas 37, 57, 71 y 87 para los resultados de queries y los inserts/updates.

**Solucion**: Tipar el resultado de `.select()` y el payload de `.insert()` / `.update()` usando la interfaz `Contract` existente, moviendo el casteo solo al resultado final en vez de en cada operacion.

**Archivo modificado**:
- `src/hooks/useContracts.ts`

---

## 3. Eliminar `as any` en usePayments e InvoiceForm

**Problema**: 
- `usePayments.ts` linea 43: `.insert(payment as any)`
- `usePayments.ts` linea 53: `(allPayments as any[])`
- `InvoiceForm.tsx` lineas 159 y 163: payload y update casteados como `any`
- `QuoteForm.tsx` linea 81: `lineItems as any`

**Solucion**: Tipar correctamente los payloads usando las interfaces existentes y el tipo `Json` de Supabase para `line_items`.

**Archivos modificados**:
- `src/hooks/usePayments.ts`
- `src/pages/InvoiceForm.tsx`
- `src/pages/QuoteForm.tsx`

---

## 4. Eliminar `as any` en CustomerDetailPage

**Problema**: Linea 40 usa `(customer as any)?.user_id` para verificar acceso al portal.

**Solucion**: Agregar `user_id` al tipo `Customer` en `useCustomers.ts`.

**Archivos modificados**:
- `src/hooks/useCustomers.ts` — agregar campo `user_id`
- `src/pages/CustomerDetailPage.tsx` — quitar casteo

---

## 5. Traducir textos en ingles dentro del PDF

**Problema**: `InvoicePDFButton.tsx` tiene textos en ingles hardcodeados en el PDF generado:
- Linea 99: "Description", "Qty", "Unit Price", "Total" (encabezados de tabla)
- Linea 48: "Fleet Management" (fallback)

**Solucion**: Cambiar los textos a espanol: "Descripcion", "Cant.", "Precio Unit.", "Total", "Gestion de Flota".

**Archivo modificado**:
- `src/components/InvoicePDFButton.tsx`

---

## 6. Tipado seguro de errores en catch blocks

**Problema**: Hay 5 archivos que usan `catch (err: any)` que TypeScript marca como mala practica. Los archivos son: InvoiceDetail, InvoicePDFButton, ContractPDFButton, CustomerDetailPage, BookingActions.

**Solucion**: Cambiar a `catch (err: unknown)` y usar `err instanceof Error ? err.message : "Error desconocido"`.

**Archivos modificados**:
- `src/pages/InvoiceDetail.tsx`
- `src/components/InvoicePDFButton.tsx`
- `src/components/ContractPDFButton.tsx`
- `src/pages/CustomerDetailPage.tsx`
- `src/components/BookingActions.tsx`

---

## Orden de implementacion

1. Crear `src/lib/types.ts` con `InvoiceWithCfdi` (base para pasos 2-3)
2. Tipar InvoiceDetail e InvoicePDFButton + traducir textos del PDF
3. Limpiar `as any` en useContracts, usePayments, InvoiceForm, QuoteForm
4. Agregar `user_id` al tipo Customer y limpiar CustomerDetailPage
5. Cambiar `catch (err: any)` a `catch (err: unknown)` en 5 archivos

## Seccion tecnica

### InvoiceWithCfdi

```text
// src/lib/types.ts
export interface InvoiceWithCfdi {
  // campos base del tipo Invoice autogenerado
  id: string;
  invoice_number: string;
  booking_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  line_items: unknown;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  // campos CFDI
  serie?: string | null;
  folio?: string | null;
  forma_pago?: string | null;
  metodo_pago?: string | null;
  uso_cfdi?: string | null;
  moneda?: string | null;
  tipo_cambio?: number | null;
  receptor_rfc?: string | null;
  receptor_razon_social?: string | null;
  receptor_regimen_fiscal?: string | null;
  receptor_domicilio_fiscal_cp?: string | null;
  cfdi_status?: string | null;
  cfdi_uuid?: string | null;
  cfdi_xml?: string | null;
}
```

### Patron para catch blocks

```text
// Antes
catch (err: any) {
  toast.error(err.message || "Error");
}

// Despues
catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Error desconocido";
  toast.error(message);
}
```
