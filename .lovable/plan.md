
# Texto adaptativo en tarjetas del Panel

## Problema
Las 6 tarjetas de estadisticas en el Panel usan un tamano de fuente fijo (`text-2xl`) para los valores. Cuando el valor es texto largo (como montos en formato moneda "$123,456.00"), el texto puede desbordar el area visible de la tarjeta, especialmente en la cuadricula de 6 columnas en escritorio.

## Solucion recomendada
Combinar dos tecnicas para un resultado estetico y funcional:

1. **Tamano de fuente condicional**: Si el valor es un string (moneda), usar `text-lg`; si es un numero corto, mantener `text-2xl`. Esto mantiene la jerarquia visual sin desbordes.

2. **Prevencion de desborde con CSS**: Agregar `min-w-0` y `truncate` como respaldo para que ningun valor rompa el layout en casos extremos.

## Cambios

### Archivo: `src/components/dashboard/StatCards.tsx`

- Agregar `min-w-0` al contenedor de texto para permitir que el contenido se encoja correctamente dentro del flexbox
- Cambiar la clase del valor de `text-2xl` fijo a una clase condicional:
  - Si `card.value` es string (moneda/texto largo): usar `text-lg`
  - Si es numero: mantener `text-2xl`
- Agregar `truncate` al parrafo del valor como respaldo visual
- Agregar `overflow-hidden` al CardContent para evitar desbordes

El resultado: numeros simples (5, 12, 0) se ven grandes y prominentes; montos como "$123,456.00" se ven en un tamano ligeramente menor que cabe perfectamente en la tarjeta sin perder legibilidad.
