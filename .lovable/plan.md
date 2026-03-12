

## Fix: Usar fecha de factura para Costo de Venta

### Problema
Los registros de `costo_venta` en `operating_expenses` tienen fechas incorrectas (2026-03-12 para la mayoría). Las facturas de venta tienen las fechas reales:

| Equipo | Factura | Fecha factura | Fecha actual gasto |
|--------|---------|---------------|-------------------|
| MCAPC035A048/002 | FAC-0025 | 2025-10-20 | 2026-03-12 |
| MCAPC035A048/004 | FAC-0026 | 2025-10-20 | 2026-03-12 |
| MCDLC50A048/001 | FAC-0001 | 2025-11-25 | 2026-03-12 |
| MCDLC100A48/001 | FAC-0001 | 2025-11-25 | 2026-02-23 |
| MCLTC025A048/007 | FAC-0027 | 2026-02-25 | 2026-03-12 |

### Solución

**1. Corregir datos existentes** — UPDATE de cada registro con la fecha de su factura correspondiente:
- `MCAPC035A048/002` → 2025-10-20
- `MCAPC035A048/004` → 2025-10-20
- `MCDLC50A048/001` → 2025-11-25
- `MCDLC100A48/001` → 2025-11-25
- `MCLTC025A048/007` → 2026-02-25

**2. Registrar en changelog** — v3.34.2

### Archivos a modificar
- Datos en `operating_expenses` (5 UPDATEs)
- `src/lib/changelog.ts`

