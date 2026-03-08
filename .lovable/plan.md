

## Plan: Estandarizar efecto hover en filas clickeables (v3.19.1)

### Análisis

Hay 6 tablas con filas clickeables (`onClick`). La mayoría ya usan el estilo consistente pero hay variaciones:

| Página | Estado actual | Cambio necesario |
|--------|-------------|-----------------|
| Contratos | `hover:bg-muted/50 border-l-2 border-transparent hover:border-primary` | Ninguno |
| Cotizaciones | Igual | Ninguno |
| Facturas | Igual | Ninguno |
| Auditoría | Igual | Ninguno |
| **Clientes** | `hover:bg-muted/50` (sin borde izquierdo) | Agregar `border-l-2 border-transparent hover:border-primary` |
| **Flota** | `hover:bg-accent/50` (color distinto) | Cambiar a `hover:bg-muted/50` y agregar patrón estándar |

### Cambios
- **`src/pages/CustomersPage.tsx`** — Agregar `border-l-2 border-transparent hover:border-primary` al `TableRow`
- **`src/pages/Fleet.tsx`** — Cambiar `hover:bg-accent/50` → `hover:bg-muted/50` para igualar el resto
- **`src/lib/changelog.ts`** — v3.19.1

