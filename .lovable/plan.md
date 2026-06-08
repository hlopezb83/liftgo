## Objetivo

Mover `contractPdfBuilder.tsx` fuera de `src/features/contracts/lib/` al espacio canónico `src/lib/pdf/` (igualando el patrón de `quote/build.tsx`) y reforzar que los componentes del PDF de contrato consuman exclusivamente los tokens y `sharedStyles` de `src/lib/pdf/theme/`.

## Cambios

### 1. Reubicar el builder
- Crear `src/lib/pdf/contract/build.tsx` con el contenido actual de `src/features/contracts/lib/contractPdfBuilder.tsx` (función `buildContractPdf`, sin cambios de lógica — sigue haciendo lazy-load de `@react-pdf/renderer`, `file-saver`, fetchers y `ContractDocument`).
- Borrar `src/features/contracts/lib/contractPdfBuilder.tsx`.
- Actualizar el único consumidor: `src/features/contracts/components/contracts/ContractPDFButton.tsx` → `import { buildContractPdf } from "@/lib/pdf/contract/build"`.

Resultado: la arquitectura PDF queda homogénea bajo `src/lib/pdf/{quote,contract,...}/build.tsx`, sin lógica de generación en carpetas `features/*/lib`.

### 2. Enforce theme/styles en el árbol de contrato
Auditar `src/lib/pdf/documents/ContractDocument.tsx` y `src/lib/pdf/documents/contract/{ContractBody,ChecklistAnnex,PagareAnnex}.tsx` para que cualquier estilo inline duplicado se reemplace por `sharedStyles` de `src/lib/pdf/theme/styles.ts`:

- `ContractHeader` (en `ContractDocument.tsx`): el bloque inline con `fontSize/fontFamily/color` para razón social y RFC se migra a usar `sharedStyles.infoName` y `sharedStyles.headerMeta` (o se añaden los estilos faltantes a `styles.ts` si difieren mínimamente — preferencia: reutilizar existentes).
- `SectionTitle` y `Bullet` en `ContractBody.tsx`: extraer a entradas nuevas en `sharedStyles` (`contractSectionTitle`, `contractBullet`) para que el tamaño/color/margenes vivan en `theme/styles.ts` en lugar de inline.
- Mismo barrido en `ChecklistAnnex` y `PagareAnnex`: cualquier `style={{ fontSize, color, ... }}` con valores que ya existan como token (`FONT_SIZES.*`, `COLORS.*`) pasa por `sharedStyles`. Si el estilo es único, se agrega al `StyleSheet.create()` central.
- Los márgenes de página, accent bar y footer ya vienen de `sharedStyles.page` + `<AccentBar/>` + `<Footer/>`; sólo verificar que ninguna sub-página los sobreescriba.

### 3. Sin cambios funcionales
- Misma API pública (`buildContractPdf(contract, mode)`), misma salida visual (mismos tokens, sólo movidos del inline al stylesheet central), mismos fetchers.
- No se toca `quote/build.tsx`, `features/invoices/lib/pdf/build.tsx`, ni `incomeStatement.tsx` / `customerStatement.tsx` (fuera de alcance — el usuario sólo pidió contrato).

### 4. Changelog
Agregar `public/changelog/v6.24.2.json` (patch — refactor sin cambio funcional) + entrada en `public/changelog.json`:
- "Builder de PDF de contrato reubicado a `src/lib/pdf/contract/build.tsx`."
- "Estilos inline del documento de contrato consolidados en `sharedStyles` (`src/lib/pdf/theme/styles.ts`)."

## Fuera de alcance
- No se mueve `features/invoices/lib/pdf/build.tsx` (el usuario sólo mencionó contrato).
- No se modifica la lógica de fetch ni de placeholders.
- No se cambian colores, tipografías ni márgenes — sólo se centraliza dónde se declaran.

## Verificación
- `rg "contractPdfBuilder|features/contracts/lib/contractPdfBuilder"` → 0 resultados.
- `rg "style=\\{\\{" src/lib/pdf/documents/contract` → idealmente 0 (o sólo casos justificados).
- Build pasa; descargar PDF de un contrato existente debe verse idéntico.