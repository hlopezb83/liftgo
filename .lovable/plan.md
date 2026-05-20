## Ola C — Auditoría §20: cierre

Cierra la auditoría arquitectónica corrigiendo el script de auditoría (subcuenta usos dinámicos), documentando las dos dependencias actualmente fuera del stack canónico y dejando trazabilidad en el changelog.

### Hallazgo

`scripts/dependency_audit.py` solo cuenta imports estáticos (`from "pkg"`), por lo que `file-saver` y `html2canvas` aparecen con **0 consumidores** cuando en realidad se usan vía `await import("pkg")` (lazy, justamente como exige §20.2 para libs > 50 KB):

- `file-saver` (4 consumidores): `src/lib/pdf/quote/build.tsx`, `src/lib/pdf/incomeStatement.tsx`, `src/lib/pdf/customerStatement.tsx`, `src/features/contracts/lib/contractPdfBuilder.tsx`, `src/features/invoices/lib/pdf/build.tsx`.
- `html2canvas` (1 consumidor): `src/features/feedback/lib/captureScreenshot.ts`.

Ambas son **canónicas de facto** para su nicho (descarga de blobs PDF y captura DOM para feedback). Falta documentarlas en §20.4 y reclasificarlas como `Canónica activa`.

### Cambios

**1. `scripts/dependency_audit.py`**
- Nuevo helper `dynamic_consumers(name)` que cuenta `import("pkg")` con `rg`. Sumar al conteo estático en `consumers_count`.
- Mover `file-saver` y `html2canvas` de `NON_CANONICAL_NOTES` a `CANONICAL`:
  - `file-saver` → `"Descargas blob (lazy)"`
  - `html2canvas` → `"Captura DOM (lazy, feedback)"`

**2. `docs/dependency-audit.md`**
- Regenerar ejecutando `python scripts/dependency_audit.py`.
- Resultado esperado: 2 deps menos en "no canónicas", conteo correcto de consumidores.

**3. `architecture.md` §20.4**
- Añadir dos filas a la tabla del stack canónico:
  - `| Descargas blob | file-saver (lazy import) | URL.createObjectURL ad-hoc duplicado |`
  - `| Captura screenshot DOM | html2canvas (lazy import) | Re-render manual a canvas |`

**4. Changelog**
- `public/changelog/v6.7.4.json` (patch): "Cierre auditoría §20 — script cuenta lazy imports, file-saver/html2canvas promovidas a canónicas, §20.4 actualizado, reporte regenerado".
- Actualizar `public/changelog.json` al inicio del array.

### Verificación
- Re-ejecutar `python scripts/dependency_audit.py` y confirmar que `file-saver` y `html2canvas` aparecen como `Canónica activa` con consumidores > 0.
- `bunx knip --no-progress` → 0 dead exports.

### Fuera de alcance
- No se toca código de aplicación (sin cambios funcionales ni de UI).
- `useFormState.ts` (única migración pendiente §20) sigue marcada como "MIGRAR media" para una ola posterior dedicada.
