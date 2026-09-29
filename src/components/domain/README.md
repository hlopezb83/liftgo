# Componentes de dominio compartidos

`src/components/domain/` contiene componentes de presentación reutilizados por
varias features. Reciben props tipadas y no consultan datos ni administran
estado de servidor. Busca sus imports antes de mover o ampliar una pieza.

| Componente | Uso |
| --- | --- |
| `DetailRow` | Filas de etiquetas y valores en vistas detalle. |
| `KpiTile` | Presentación de métricas de negocio. |
| `NotesCard` | Notas en paneles de detalle. |
| `ReadOnlyLineItemsTable` | Partidas de sólo lectura en documentos. |
| `ReportChartCard` | Contenedor visual de gráficas. |
| `TotalsSummary` | Subtotales, descuentos y totales. |

Si un componente queda con un único consumidor, muévelo al feature dueño.
Actualiza este inventario cuando cambien los archivos o la responsabilidad.
