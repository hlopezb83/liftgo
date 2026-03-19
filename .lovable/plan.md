

# Agregar Términos de Uso de Horas en Cotizaciones de Renta

## Objetivo
Agregar dos condiciones fijas a los términos y condiciones del PDF de cotizaciones de renta:
1. "Equipo sujeto a 200 horas de uso mensual"
2. "El uso de horas extras lleva un costo adicional"

## Cambio

**Archivo:** `src/lib/quotePdfPremium.ts` — función `drawTermsSection`

Actualmente los términos son un arreglo fijo de 4 puntos. El plan es:

1. Recibir un parámetro adicional `quoteType` (o `isRental`) en `drawTermsSection`
2. Cuando la cotización sea de tipo **renta**, insertar dos bullets adicionales:
   - `"• Equipo sujeto a 200 horas de uso mensual."`
   - `"• El uso de horas extras lleva un costo adicional."`
3. Actualizar la llamada a `drawTermsSection` en el generador de PDF principal para pasar el tipo de cotización

Esto garantiza que estos términos aparezcan automáticamente en toda cotización de renta, sin que el usuario tenga que escribirlos manualmente en las notas.

