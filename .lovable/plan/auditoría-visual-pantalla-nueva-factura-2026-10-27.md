# Auditoría visual: pantalla «Nueva factura»

Revisé la pantalla abierta desde una extensión (RSV-0039, 1280 px de ancho). Sólo cambia la presentación: no se tocan cálculos, reglas fiscales, permisos ni datos.

## Hallazgos (por prioridad)

**Alta**
1. **No dice que es una extensión.** La pantalla se ve igual que una factura normal. Falta un aviso arriba: «Facturando extensión de RSV-0039 · 01/10/2026 – 31/10/2026».
2. **Las fechas se ven en dos formatos.** «Fecha de factura» usa dd/mm/aaaa (26/10/2026), pero «Periodo» usa mm/dd/aaaa (10/01/2026). Eso confunde el 1 de octubre con el 10 de enero.
3. **Las partidas aparecen cortadas.** La descripción («MCLTC035A048/012 — Extensi…») y las claves SAT («78181500 -..», «DAY -…») no se leen completas. Por eso tampoco se nota que la unidad DAY no corresponde a una renta mensual.
4. **El botón «Crear factura» queda lejos.** Está hasta el final de una página larga y no se ve el total al decidir.

**Media**
5. **El cliente aparece en una caja dentro de otra.** Ocupa una columna angosta y deja espacio vacío a la derecha.
6. **«Fecha de vencimiento» vacía, sin explicación.** No se indica si es opcional ni cómo se calcula con PUE.
7. **El descuento vacío muestra «–»** en lugar de un campo o un «0 %» claro.
8. **Los totales están en una tarjeta aparte**, separados de las partidas que suman.

**Baja**
9. **El folio tentativo** («BORRADOR-0016») usa un color de alerta aunque no lo sea.
10. **El texto de ayuda del periodo** («El índice de duplicados usa este rango») usa lenguaje técnico.
11. **Pantallas medianas (855 px, tu vista actual):** hay que confirmar que la tabla de partidas no se desborde.

## Propuesta de cambios

- Aviso de contexto cuando la factura viene de una extensión o de una cotización, con folio y periodo.
- Formato de fecha mexicano dd/mm/aaaa en todos los campos de fecha.
- Partidas: descripción en varias líneas y claves SAT con código y nombre corto visibles, con el nombre completo al pasar el cursor.
- Barra inferior fija con el total y los botones «Cancelar» y «Crear factura».
- El cliente en el mismo renglón que las fechas, sin la caja doble.
- Ayuda bajo «Fecha de vencimiento» y un texto más claro bajo el periodo.
- Totales pegados debajo de la tabla de partidas.
- Color neutro para el folio tentativo.
- Revisión de la tabla a 855 px y en celular.

## Validación

- Capturas antes y después a 1280 px, 855 px y 375 px, sin guardar ninguna factura.
- Pruebas puntuales de los componentes que cambien; las pruebas completas corren en GitHub.
- Una entrada nueva en el historial de cambios (versión menor de presentación).

## Detalles técnicos

- Archivos de presentación de `src/features/invoices` (página InvoiceForm y sus secciones); se ubicarán antes de editar.
- Sólo se usan los colores y estilos del sistema de diseño; no se tocan hooks, validaciones ni el envío del formulario.
