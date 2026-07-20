# Auditoría Ola 2 (v7.114.3)

✅ **Todo en verde:**
- Vitest: **1083/1083** pruebas pasan (159 suites).
- ESLint: **0 errores**, 72 warnings (bajaron de 82).
- Los 8 refactors de prev-prop guard funcionan; los diálogos siguen reseteando su estado local al abrir/cerrar (validado por `useRecordPaymentForm.test.ts` 11/11).

**Sin bugs pendientes de Ola 2.** Sin tests faltantes (los componentes refactorizados son wrappers de UI cuya lógica de fondo — `useSupplierBillForm`, `useCreatePaymentBatch`, `useBankStatementLines` — ya está cubierta).

**Nota:** Del bucket original de `react-hooks/set-state-in-effect` quedan **14 warnings** (no 22, porque varios ya se resolvieron colateralmente con otros fixes). Se atacan como parte de Ola 3.

# Ola 3 — Desglose actualizado de warnings

| Regla                                | # | Estrategia                                                                 |
| ------------------------------------ | -- | --------------------------------------------------------------------------- |
| `react-hooks/refs`                   | 27 | Bucket más grande. Mover lecturas de `.current` fuera de render.           |
| `react-hooks/set-state-in-effect`    | 14 | Continuar patrón prev-prop guard o derivación con `useMemo`.               |
| `react-refresh/only-export-components` | 9 | Separar constantes/utilidades de módulos que exportan componentes.        |
| `react-hooks/incompatible-library`   | 6 | Revisar libs que rompen reglas (probable `react-hook-form` legacy usage).  |
| `max-lines-per-function` / `complexity` / `max-lines` | 10 | Extraer sub-funciones o dividir archivos.               |
| `react-compiler/react-compiler`      | 2 | Efecto colateral: al arreglar los disables regresan al compilador.         |
| `no-restricted-imports`              | 2 | Reemplazar imports prohibidos por el alias correcto.                       |
| `react-hooks/purity` / `static-components` | 2 | Casos puntuales.                                                     |

# Plan de ejecución Ola 3

Ejecutar en 3 sub-olas para mantener commits pequeños y auditables.

## 3.a — `react-hooks/refs` (27 warnings, prioridad alta)

Este bucket concentra el mayor impacto. Casos típicos:
- `useTableFilters.ts:362-370`: lee `f.fields`/`f.accessors` desde un ref dentro de `matchSorter` en render.
- Cualquier hook que use `useRef` como caché de opciones y luego lo consuma en `useMemo`/render.

**Enfoque:**
1. Para refs usados sólo como cache de callbacks: sustituir por `useEffectEvent` o `useCallback` con deps explícitas.
2. Para refs que sostienen datos derivables: derivar con `useMemo` desde props/state.
3. Para refs de DOM leídos en render: mover la lectura a `useLayoutEffect` y guardarla en state.

**Riesgo:** medio. Mitigación: correr `bunx vitest run` tras cada archivo y validar visualmente el módulo (`useTableFilters` afecta a todas las tablas — probar Facturas, Clientes, Cotizaciones).

## 3.b — `set-state-in-effect` restantes (14)

Localizar con `bunx eslint src -f json` filtrando por regla y aplicar el mismo patrón prev-prop guard de Ola 2. Los sospechosos identificados en el turno anterior:
- `useChangelogDeepLink.ts`, `CustomersPage.tsx`, `useSetPasswordForm.ts`,
- `PostBookingDeliveryDialog.tsx`, `PostBookingPolicyDialog.tsx`, `PostDeliveryPickupDialog.tsx`,
- `EditNameDialog.tsx`, y ~7 más.

**Riesgo:** bajo (patrón ya probado en Ola 2).

## 3.c — `only-export-components` (9) + `incompatible-library` (6) + varios

- **only-export-components:** dividir archivos que exportan componente + constantes/utilidades en dos: `Component.tsx` y `Component.constants.ts` o `Component.utils.ts`.
- **incompatible-library:** revisar el uso — probablemente `react-hook-form` pasando funciones a hooks internos. Encapsular con `useEffectEvent`.
- **no-restricted-imports (2):** corregir path prohibido.
- **max-lines / complexity (10):** extraer sub-funciones donde el diff sea contenido.
- **react-compiler (2):** desaparecen cuando se quitan los `eslint-disable` del código refactorizado.

## Métricas objetivo

- Warnings ESLint: **72 → ≤ 25** al cierre de Ola 3.
- Errores ESLint: **0** (mantener).
- Vitest: **1083/1083** (mantener).
- Sin regresiones visuales en tablas ni diálogos.

## Detalles técnicos

- Changelogs a emitir: `v7.114.4` (Ola 3.a refs), `v7.114.5` (Ola 3.b setState restantes), `v7.114.6` (Ola 3.c cleanup).
- Cada sub-ola actualiza `public/changelog.json` y crea el detalle en `public/changelog/v7.114.X.json` (regla core del proyecto).
- Reutilizar el patrón prev-prop guard ya documentado en `useRecordPaymentForm.ts` como referencia canónica.
- No introducir dependencias nuevas — usar únicamente API de React 19 (`useEffectEvent`, `useMemo`, `useCallback`).

¿Arranco por **3.a (refs)** para atacar el bucket más grande primero, o prefieres empezar por **3.b (setState restantes)** que es el patrón más seguro?
