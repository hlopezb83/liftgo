# `src/components/domain/` — componentes de dominio compartido

Componentes UI que encapsulan una convención de **presentación de datos de negocio** consumida por 2+ features. No hablan con Supabase ni contienen lógica de fetching; reciben props tipadas.

Auditado en v6 (P3-7): los componentes listados debajo son legítimamente cross-feature y por eso viven aquí en lugar de `features/<x>/components/`.

| Componente | Consumido por | Justificación |
| --- | --- | --- |
| `DetailRow` / `NotesCard` | invoices, quotes, bookings, contracts, deliveries, returns, damage, fleet | Layout genérico para vistas detalle |
| `TotalsSummary` | invoices, quotes | Totales moneda + descuentos |
| `ReadOnlyLineItemsTable` | invoices, quotes | Tabla de partidas en modo lectura (misma estructura contable) |
| `ReportChartCard` | reports, dashboard | Tarjeta wrapper para charts |

Si un componente aquí termina siendo usado por **una sola** feature, muévelo a `features/<esa>/components/`.
