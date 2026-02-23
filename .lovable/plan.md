
# Traducir estados en Desglose de Facturas

## Problema
En el componente `InvoiceBreakdown.tsx`, los estados de las facturas se muestran en ingles ("draft", "sent", "paid", "overdue") porque se renderiza `group.status` directamente sin traduccion.

## Solucion
Importar `STATUS_LABELS` desde `@/lib/constants` y usarlo para mostrar la etiqueta en espanol.

## Cambio

**Archivo:** `src/components/dashboard/InvoiceBreakdown.tsx`

- Agregar import de `STATUS_LABELS` desde `@/lib/constants`
- Linea 37: cambiar `{group.status}` por `{STATUS_LABELS[group.status] || group.status}`

Es un cambio de 2 lineas que resuelve el problema usando el mapa centralizado que ya creamos.
