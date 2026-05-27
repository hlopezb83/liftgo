# Mobile QA — v6.13.2

Pasada manual de QA mobile contra el preview en viewport 375x812 (iPhone 13).
Ejecutada vía herramienta de browser automatizado con sesión admin.

## Rutas validadas

| Ruta | Render | Componente | Hallazgos |
|------|--------|------------|-----------|
| `/` (Panel) | ✅ OK | KPI cards stacked + bloque Facturas Vencidas | Sin scroll horizontal. KPIs legibles, tap targets >44px. |
| `/fleet` | ✅ OK | `MobileCardList` | Cards muestran serial, status badge y modelo. Botones primarios visibles sin scroll. |
| `/invoices` | ✅ OK | `MobileCardList` | Folio, cliente, fechas y monto en una sola tarjeta. Status badge a la derecha. |

## Checklist aplicado

- [x] Sidebar colapsado (icono toggle en header)
- [x] `MobileCardList` renderiza en vez de tabla en listas
- [x] Sin overflow horizontal en `body` (`overflow-x: hidden`)
- [x] Botones primarios visibles sin scroll
- [x] Status badges legibles
- [x] Filtros accesibles vía botón expandible

## Findings clasificados

### Bloqueantes (debe arreglarse antes de RC)

Ninguno.

### No bloqueantes (deuda post-RC)

1. **Cobertura parcial de la pasada**: solo se validaron 3 rutas con sesión activa. Rutas como `/quotes`, `/bookings`, `/maintenance`, `/customers`, `/calendar`, `/portal/login` quedan pendientes para la siguiente iteración (necesitan ampliarse en mobile-qa-v6.14.x).
2. **Formularios complejos sin validar en mobile**: `BookingForm`, `QuoteForm`, `InvoiceForm` tienen muchos campos; se recomienda revisar manualmente en mobile que ningún input se corta.
3. **Tablas anidadas en detalles**: páginas de detalle (`/fleet/:id`, `/invoices/:id`, etc.) pueden tener tablas internas (líneas de factura, partes, etc.) que aún no usan `MobileCardList`.

### Mejoras sugeridas

- Considerar `data-testid` en headers principales para que Playwright tests sean estables sin depender de copy.
- Documentar shortcuts de teclado para que no apliquen en mobile.

## Proceso para próximas pasadas

Ver `architecture.md` §15.4 — Mobile QA.

---

**Fecha**: 2026-05-27 · **Versión**: v6.13.2 · **Viewport**: 375x812
