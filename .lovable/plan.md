

# Mostrar botones de editar en cotizaciones enviadas

## Problema
En `QuoteDetail.tsx` línea 212, los botones "Editar" y "Marcar Enviada" solo se muestran cuando `quote.status === "draft"`. Al marcar como enviada, ambos botones desaparecen y ya no se puede editar.

## Solución
Separar la lógica: mostrar el botón "Editar" cuando el status sea `"draft"` o `"sent"`, y mostrar "Marcar Enviada" solo en `"draft"`.

### `src/pages/QuoteDetail.tsx`
- Mover el botón "Editar" fuera del bloque condicional de `draft`, para que aparezca en status `draft` y `sent`
- Mantener "Marcar Enviada" solo en `draft`

