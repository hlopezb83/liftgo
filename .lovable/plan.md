# Plan: Actualizar `architecture.md`

Ámbito: **solo documentación** (`architecture.md` + entrada de changelog). Sin tocar código de producción.

## Cambios por sección

### 1. §2 Stack tecnológico
- Reemplazar la fila "Documentos" para que diga `@react-pdf/renderer ^4.5.1` (declarativo). Eliminar la mención a `jsPDF 4.x + jspdf-autotable`.
- Mantener nota en §20.4 (ya correcta).

### 2. §5.2 Patrones reutilizables de UI
- Quitar `SortableTableHead` de la lista (componente eliminado en v6.12.x).
- Añadir `DataTableV2` + `useLiftgoTable` como el patrón actual de tablas avanzadas (sorting, virtualización, paginación, `autoResetPageIndex: false` por defecto tras el fix v6.12.5).
- Anotar `useFormState` como `@deprecated` con `TODO(deps)` → migrar a `react-hook-form` (consistente con `docs/dependency-audit.md`).

### 3. §9 Generación de documentos (PDFs) — **reescritura completa**
La sección actual describe la estructura imperativa jsPDF que ya no existe. Reemplazar por la real:

```text
src/lib/pdf/
├── documents/                  Documentos React-PDF declarativos
│   ├── InvoiceDocument.tsx
│   ├── QuoteDocument.tsx
│   ├── ContractDocument.tsx
│   ├── CustomerStatementDocument.tsx
│   ├── IncomeStatementDocument.tsx
│   └── contract/               ContractBody, ChecklistAnnex, PagareAnnex
├── components/                 Bloques compartidos (Header, Footer, InfoCards,
│                               LineItemsTable, TotalsBox, AccentBar)
├── theme/                      tokens.ts (colores, espaciados, tipografía)
│                               styles.ts (StyleSheet.create compartido)
├── contract/                   Datos: placeholderRegistry, placeholders,
│                               data-templates, fetchers
├── quote/build.tsx             Builder de descarga
├── shared.ts                   Helpers compartidos (datos de empresa)
└── loadImageAsBase64.ts        Logo
```

Puntos clave a documentar:
- Motor: `@react-pdf/renderer` (declarativo, JSX); migración registrada en v6.6.0-alpha.1.
- `theme/tokens.ts` es la única fuente de tokens visuales (colores, fuentes, márgenes A4).
- `placeholderRegistry.ts` sigue siendo fuente de verdad para plantillas de contrato.
- Carga diferida del PDF builder desde el botón que dispara la descarga.
- Logo escalado 24×40 mm (ya documentado en `mem://style/branding/logo`).
- Eliminar mención a "jsPDF locked ≤ 4.0.0" en esta sección (queda en §20 si se quiere histórico, pero ya no es relevante operativamente).

### 4. §20.5 paso 2 — typo
- Cambiar "checklist 21.2" → "checklist §20.2".

### 5. §1 Audiencia / módulos
- Añadir bajo "Administración": **Feedback interno** (reportes de usuarios, leaderboard público, gestión Kanban admin) con referencia a `mem://features/feedback`.
- Añadir las rutas notables en §7: `/feedback`, `/mis-reportes`, `/leaderboard`.

### 6. §17 Anti-patrones (limpieza menor)
- Verificar/actualizar referencias a componentes eliminados.

### 7. Nueva sub-sección §5.5 — Tablas avanzadas (DataTableV2)
Documentar como patrón propio:
- Cuándo usar `DataTableV2` vs tabla cruda de shadcn.
- `useLiftgoTable` envuelve TanStack Table con defaults seguros: `autoResetPageIndex: false`, sorting controlado, paginación cliente 25.
- Convención: dependencias estables en `useListFilters` para evitar loops con `autoResetPageIndex` (lección del fix v6.12.5).

### 8. §15 Testing
- Añadir suites recientes que hoy no se listan (revisar `src/test/` y `src/**/__tests__/`): `useDebouncedValue`, `useDialogState`, `useListFilters`, `partFormSchema`, `markdown`.

### 9. §21 Referencias
- Añadir `docs/dependency-audit.md` y `scripts/dependency_audit.py`.
- Añadir `src/components/dataTable/v2/` como referencia del patrón de tablas.

### 10. Entrada de changelog
- Nueva versión `v6.12.6` tipo **patch** categoría **docs**.
- Crear `public/changelog/v6.12.6.json` con detalle de las 9 actualizaciones.
- Insertar entrada al inicio de `public/changelog.json` (índice).

## Verificación

- Releer `architecture.md` completo tras los cambios para detectar inconsistencias residuales (numeración de secciones, referencias cruzadas).
- Confirmar que ningún snippet de código quedó referenciando símbolos eliminados (`SortableTableHead`, `jspdf-autotable`).
- No se ejecuta lint/test: cambio es exclusivo de documentación + JSON de changelog.

## Riesgo

Nulo. Documentación y changelog. No toca código de producción, migraciones ni configuración.

## Fuera de alcance

- No se renombra `useFormState` ni se migra a `react-hook-form` (queda como deuda anotada).
- No se elimina `jspdf` de `package.json` si quedara alguna referencia residual (verificación rápida sugiere que ya no está, pero no es objetivo de este plan).
- No se añade Sentry a §2 (no está instrumentado en el código, solo disponible como tool externo).
