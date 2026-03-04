

## Actualizar el changelog con los cambios recientes

### Entradas faltantes

Revisar `src/lib/changelog.ts` y agregar las siguientes entradas al inicio del array, con versiones incrementales desde `3.5.1`:

| Versión | Tipo | Título | Cambios clave |
|---------|------|--------|---------------|
| 3.6.0 | minor | Refactorización de código | Helpers PDF reutilizables, hook useListPage, modularización de ContractPDFButton, consolidación de estado en InvoiceForm, NotesCard con modo lectura, renombrado de variables |
| 3.5.3 | patch | Corrección de facturación recurrente | Primera factura ahora cubre el mes de inicio de la reserva en lugar de saltarlo |
| 3.5.2 | patch | Corrección de cálculo de meses en rentas | Fecha final tratada como inclusiva para que periodos como 01/12 al 30/11 calcule 12 meses exactos |

### Cambio técnico

Archivo único: `src/lib/changelog.ts` — agregar 3 objetos `ChangelogEntry` al inicio del array `changelog`. `CURRENT_VERSION` se actualizará automáticamente ya que usa `changelog[0].version`.

