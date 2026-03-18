

# Plan: Registrar Horas de Uso (Horómetro) en Entregas

## Contexto
Al entregar o recoger un equipo, es importante registrar la lectura del horómetro para llevar control del uso. Actualmente la tabla `deliveries` no tiene este campo.

## Propuesta
Agregar un campo `hours_reading` (numeric, nullable) a la tabla `deliveries` que se capture en dos momentos:

1. **Al completar la entrega** — en el diálogo de firma/completar, agregar un campo "Lectura de Horómetro (horas)" antes de la firma.
2. **Al completar la recolección** — mismo campo disponible.

Esto permite comparar horas al entregar vs. horas al recoger para calcular uso real durante la renta.

## Cambios

### 1. Migración SQL
- `ALTER TABLE deliveries ADD COLUMN hours_reading numeric;`

### 2. `src/pages/DeliveryDetail.tsx`
- En el diálogo de "Completar", agregar un input numérico para "Horómetro (horas)" antes del SignaturePad.
- Pasar el valor en el `updateDelivery.mutate()` junto con `status: "completed"`.
- Mostrar la lectura en la card de "Equipo" cuando exista.

### 3. `src/components/bookings/PostBookingDeliveryDialog.tsx`
- Agregar campo opcional "Horómetro" en el formulario de programación de entrega (para pre-registrar si se conoce).

### 4. `src/components/deliveries/PostDeliveryPickupDialog.tsx`
- Mismo campo opcional de horómetro.

### 5. `src/pages/DeliveriesPage.tsx`
- Mostrar columna opcional "Horas" en la tabla si hay datos.

### 6. Bump versión a v3.56.0

## Flujo del usuario
1. Se crea una entrega (el horómetro es opcional en este punto)
2. Al marcar como completada, se solicita la lectura del horómetro junto con la firma
3. La lectura queda registrada y visible en el detalle

