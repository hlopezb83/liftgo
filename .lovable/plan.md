## Problema
El breadcrumb del header muestra "Cuentas por pagar" porque el slug `cuentas-por-pagar` no está en `SEGMENT_LABELS` y cae al fallback (capitaliza el slug).

## Cambio
- `src/layouts/TopbarBreadcrumbs.tsx`: agregar `"cuentas-por-pagar": "Facturas de Proveedor"` y `antiguedad: "Antigüedad"` al mapa `SEGMENT_LABELS`.

## Fuera de alcance
- No se renombra la URL.
- No se toca nada más.

Sin entrada nueva de changelog (es continuación inmediata del rename v6.81.0).
