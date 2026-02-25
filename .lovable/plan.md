

# Feature: Crear contrato desde reserva + Resumen financiero de renta

## 1. Crear contrato desde reserva (auto-fill)

### Que hace
Agrega un boton "Crear Contrato" en las acciones de cada reserva confirmada. Al hacer clic, navega a `/contracts/new?booking_id=<id>` y el formulario de contrato se pre-llena automaticamente con los datos de la reserva: cliente, equipo, fechas, tarifas y referencia al booking.

### Cambios

**`src/components/BookingActions.tsx`**
- Agregar un boton "Crear Contrato" (icono `FileText`) junto a los botones existentes (Extender, Devolucion, Cancelar)
- Al hacer clic: `navigate(\`/contracts/new?booking_id=\${booking.id}\`)`

**`src/pages/ContractForm.tsx`**
- Importar `useSearchParams` de react-router-dom y `useBookings` (o hacer una query directa del booking por ID)
- Leer `booking_id` de los query params
- Si `booking_id` esta presente y no es edicion:
  - Consultar el booking con su forklift asociado
  - Pre-llenar `customer_id`, `forklift_id`, `start_date`, `end_date`, y las tarifas del equipo
  - Guardar `booking_id` en el payload para que el contrato quede vinculado a la reserva
- El campo `booking_id` ya existe en la tabla `contracts` asi que no se necesitan migraciones

### Flujo del usuario
1. En la pagina de Calendario, busca una reserva confirmada
2. Hace clic en "Crear Contrato"
3. Se abre el formulario de contrato con todos los campos pre-llenados
4. Solo necesita agregar terminos/notas y guardar

---

## 2. Resumen financiero de renta a largo plazo

### Que hace
Muestra un card compacto en la pagina de detalle del contrato (y opcionalmente en CalendarPage) con:
- **Revenue esperado total**: calculado a partir de las tarifas y la duracion del contrato
- **Facturado hasta ahora**: suma de facturas vinculadas al booking
- **Balance restante**: diferencia entre esperado y facturado

### Cambios

**`src/components/RentalFinancialSummary.tsx`** (nuevo)
- Componente que recibe: `bookingId`, `startDate`, `endDate`, `dailyRate`, `weeklyRate`, `monthlyRate`
- Usa `calculateRentalCost` de `invoiceUtils.ts` para calcular el revenue esperado
- Consulta facturas vinculadas al booking (`invoices` where `booking_id = X`) para sumar lo facturado
- Muestra 3 metricas en un card compacto:
  - Revenue esperado (con desglose de periodos)
  - Facturado (con conteo de facturas)
  - Balance restante (con indicador de color: verde si esta al dia, amarillo si hay diferencia)

**`src/pages/ContractDetail.tsx`**
- Si el contrato tiene `booking_id`, renderizar `RentalFinancialSummary` debajo de los detalles del contrato

**`src/pages/CalendarPage.tsx`**
- En cada fila de reserva confirmada, agregar un mini indicador del revenue esperado total (opcional, texto compacto)

### Logica de calculo
```text
dias = differenceInDays(endDate, startDate) + 1
items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, dias)
expectedRevenue = sum(items.total)
invoicedAmount = SUM(invoices.total WHERE booking_id = X)
remaining = expectedRevenue - invoicedAmount
```

---

## Secuencia de implementacion

1. Modificar `ContractForm.tsx` para leer query params y pre-llenar desde booking
2. Agregar boton "Crear Contrato" en `BookingActions.tsx`
3. Crear componente `RentalFinancialSummary.tsx`
4. Integrarlo en `ContractDetail.tsx`

## Sin migraciones necesarias
Todos los campos requeridos (`booking_id` en contracts, tarifas en forklifts, `booking_id` en invoices) ya existen en la base de datos.
