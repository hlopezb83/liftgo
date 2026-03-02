

## Agregar dialogo de facturacion recurrente al convertir cotizacion a reserva

### Problema
Cuando una cotizacion de periodo largo (>= 30 dias) se convierte a reserva desde `QuoteDetail`, las reservas se crean sin `recurring_billing`, ignorando la necesidad de facturacion mensual automatica.

### Solucion
Interceptar el clic en "Convertir a Reserva" con un dialogo intermedio que pregunte al usuario si desea habilitar facturacion recurrente, pero solo cuando el periodo de la cotizacion sea >= 30 dias. Si es menor a 30 dias, se procede directamente sin preguntar.

### Cambios en `src/pages/QuoteDetail.tsx`

**1. Nuevo estado para el dialogo**
- Agregar `showRecurringDialog` (boolean) para controlar la visibilidad del dialogo.
- Agregar `recurringBillingChoice` (boolean) para almacenar la eleccion del usuario.

**2. Modificar el flujo del boton "Convertir a Reserva"**
- Al hacer clic, verificar si `differenceInDays(end_date, start_date) >= 30`.
  - Si es >= 30 dias: abrir el dialogo preguntando sobre facturacion recurrente.
  - Si es < 30 dias: ejecutar `convertToBooking(false)` directamente.

**3. Nuevo componente de dialogo (inline)**
- Usar `Dialog` (ya importado en el proyecto) con:
  - Titulo: "Facturacion Recurrente"
  - Descripcion: "Esta cotizacion cubre un periodo de X meses. Desea habilitar la facturacion recurrente mensual para las reservas que se crearan?"
  - Dos botones: "No, crear sin recurrente" y "Si, habilitar recurrente"
- Ambos botones cierran el dialogo y llaman a `convertToBooking(recurringBilling)`.

**4. Pasar `recurring_billing` al crear reservas**
- Modificar la llamada `createBooking.mutateAsync()` para incluir `recurring_billing: recurringBilling` como parametro.

### Flujo resultante

```text
Usuario clica "Convertir a Reserva"
        |
   Periodo >= 30 dias?
   /           \
  Si            No
  |              |
  Dialogo:      Crear reservas
  "Habilitar    directamente
  recurrente?"  (recurring=false)
  /        \
 Si         No
 |          |
 Crear      Crear
 reservas   reservas
 (true)     (false)
```

### Detalle tecnico

- Importar `differenceInDays` de `date-fns` (ya disponible en el proyecto).
- Refactorizar `convertToBooking` para aceptar un parametro `recurringBilling: boolean`.
- En la llamada a `createBooking.mutateAsync`, agregar `recurring_billing: recurringBilling`.
- Usar el componente `Dialog` existente (`@/components/ui/dialog`) para el dialogo intermedio, manteniendo consistencia visual con el resto de la aplicacion.

