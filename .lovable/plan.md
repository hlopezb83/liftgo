
# Mejoras de Calidad de Codigo

## 1. Texto "No Access" ya corregido
El componente `NoAccess` en `App.tsx` (linea 55-58) ya esta en espanol: "No tienes permiso para acceder a esta pagina." -- esto se corrigio en una iteracion anterior. No requiere cambios.

## 2. Centralizar mapas de traduccion de estados

Actualmente las traducciones de estados estan duplicadas como objetos inline en multiples archivos:

- `src/pages/Fleet.tsx` -- `{ available: "Disponible", rented: "Rentado", ... }`
- `src/pages/ForkliftForm.tsx` -- misma traduccion duplicada
- `src/pages/ForkliftDetail.tsx` -- misma traduccion duplicada
- `src/pages/InvoicesPage.tsx` -- `{ all: "Todas", draft: "Borrador", sent: "Enviada", ... }`
- `src/pages/ContractsPage.tsx` -- `{ all: "Todos", draft: "Borrador", sent: "Enviado", ... }`
- `src/pages/QuotesPage.tsx` -- `STATUS_LABELS` local
- `src/components/StatusBadge.tsx` -- `statusConfig` con labels y clases

### Cambios planeados

**a) Crear mapa central en `src/lib/constants.ts`:**

Agregar un diccionario `STATUS_LABELS` que mapee cada status en ingles a su etiqueta en espanol. Este mapa se alimentara de las etiquetas ya definidas en `StatusBadge.tsx` y cubrira todos los estados del sistema (available, rented, draft, sent, paid, overdue, etc.).

**b) Actualizar archivos que duplican traducciones:**

Reemplazar los objetos inline en estos 5 archivos para que importen y usen `STATUS_LABELS` de `constants.ts`:
- `Fleet.tsx` (linea 58)
- `ForkliftForm.tsx` (linea 237)
- `ForkliftDetail.tsx` (linea 162)
- `InvoicesPage.tsx` (linea 61)
- `ContractsPage.tsx` (linea 53)
- `QuotesPage.tsx` (linea 20 -- eliminar constante local)

**c) Refactorizar `StatusBadge.tsx`:**

El `statusConfig` mantendra las clases CSS pero usara `STATUS_LABELS` para los textos, eliminando la duplicacion.

## 3. Mas cobertura de tests

Actualmente solo existen tests unitarios para utilidades puras (`formatCurrency`, `exportCsv`, `invoiceUtils`). Se agregaran tests para logica de negocio critica.

### Tests a crear

**a) `src/test/constants.test.ts`** -- Verificar que `STATUS_LABELS` cubre todos los estados definidos en las constantes existentes (`FORKLIFT_STATUSES`, `DAMAGE_STATUSES`, `INSPECTION_CONDITIONS`).

**b) `src/test/bookingFlow.test.ts`** -- Test de la funcion `useCreateBooking` validando que se llama al RPC `create_booking` con los parametros correctos (usando mocks de Supabase).

**c) `src/test/invoiceFlow.test.ts`** -- Test del flujo de creacion de factura: verificar que `useCreateInvoice` genera numero de factura via RPC y luego inserta el registro.

**d) `src/test/paymentFlow.test.ts`** -- Test de `useCreatePayment` verificando que se inserta el pago y se invalidan las queries relacionadas.

---

## Detalles tecnicos

### Estructura del mapa centralizado

```typescript
// src/lib/constants.ts
export const STATUS_LABELS: Record<string, string> = {
  all: "Todos",
  available: "Disponible",
  rented: "Rentado",
  maintenance: "Mantenimiento",
  retired: "Retirado",
  draft: "Borrador",
  sent: "Enviado",
  paid: "Pagado",
  overdue: "Vencido",
  confirmed: "Confirmado",
  accepted: "Aceptado",
  declined: "Rechazado",
  expired: "Expirado",
  completed: "Completado",
  // ... todos los demas estados
};
```

### Patron de uso en componentes

```tsx
// Antes (duplicado en cada archivo):
{{ available: "Disponible", rented: "Rentado", ... }[s]}

// Despues (centralizado):
import { STATUS_LABELS } from "@/lib/constants";
{STATUS_LABELS[s] || s}
```

### Archivos modificados (resumen)

| Archivo | Cambio |
|---------|--------|
| `src/lib/constants.ts` | Agregar `STATUS_LABELS` |
| `src/components/StatusBadge.tsx` | Importar `STATUS_LABELS` para labels |
| `src/pages/Fleet.tsx` | Reemplazar mapa inline |
| `src/pages/ForkliftForm.tsx` | Reemplazar mapa inline |
| `src/pages/ForkliftDetail.tsx` | Reemplazar mapa inline |
| `src/pages/InvoicesPage.tsx` | Reemplazar mapa inline |
| `src/pages/ContractsPage.tsx` | Reemplazar mapa inline |
| `src/pages/QuotesPage.tsx` | Eliminar `STATUS_LABELS` local |
| `src/test/constants.test.ts` | Nuevo -- tests de cobertura del mapa |
| `src/test/bookingFlow.test.ts` | Nuevo -- test de creacion de reserva |
| `src/test/invoiceFlow.test.ts` | Nuevo -- test de creacion de factura |
| `src/test/paymentFlow.test.ts` | Nuevo -- test de registro de pago |
