# Pagaré por el costo de adquisición del equipo

Hoy el pagaré (Anexo B del contrato) se emite por el **depósito en garantía** (`{deposito}`). Se cambiará para que el monto sea el **costo de adquisición del equipo** que ya existe en el detalle del montacargas (campo "costo de adquisición").

## Qué cambia

- El campo "Bueno por:" del Anexo B mostrará el costo de adquisición del equipo del contrato.
- El texto por defecto del pagaré dirá "la cantidad de {monto_pagare}" en vez de "{deposito}".
- Nueva variable disponible para plantillas: `{monto_pagare}` (costo de adquisición del equipo), documentada en el listado de variables de la pantalla de plantillas de contrato.
- La cláusula de depósito en garantía del contrato sigue usando `{deposito}` (no se toca).
- Si el equipo no tiene costo de adquisición registrado, el pagaré cae de regreso al depósito en garantía, para no emitir un pagaré en $0.00.

## Detalle técnico

- `src/lib/pdf/contract/fetchers.ts`: agregar `acquisition_cost` al select de `forklifts`.
- `src/lib/pdf/contract/placeholders.ts`: agregar `monto_pagare` a las variables (costo de adquisición formateado; fallback a `deposit_amount`), y ampliar el tipo `ForkliftInfo`.
- `src/lib/pdf/documents/contract/PagareAnnex.tsx`: "Bueno por:" usa `vars.monto_pagare`.
- `src/lib/pdf/contract/data-templates.ts`: `DEFAULT_PAGARE` usa `{monto_pagare}`.
- `src/lib/pdf/contract/placeholderRegistry.ts`: registrar `{monto_pagare}`.
- Tests: caso en los tests de placeholders/PDF que valide monto con y sin costo de adquisición.
- Changelog: nueva entrada minor (v7.303.0).

Nota: los contratos sin equipo asignado seguirán mostrando el monto del depósito.
