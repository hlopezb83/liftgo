# Migración date-fns 3 → 4

## Contexto
- Uso actual: `date-fns@^3.6.0` + `date-fns-tz@^3.2.0` en 82 archivos.
- API usada: `format`, `parseISO`, `addDays/Months`, `differenceIn*`, `startOf*`, `endOf*`, `eachDayOfInterval`, `isToday`, `isSameDay`, `getDay`, `isWithinInterval`, `subMonths/Weeks`, `addWeeks`, locale `es` desde `date-fns/locale`, y `toZonedTime` desde `date-fns-tz`.
- `date-fns-tz@3.2` ya es compatible con v4 (soporta el nuevo sistema de context/timezone), no requiere bump.

## Cambios relevantes de v4
1. ESM-first + tree-shaking mejorado. Vite lo maneja sin cambios.
2. Nuevo argumento opcional `in` (context) para timezone nativo — **no lo usamos, no rompe nada**.
3. Locale sigue en `date-fns/locale` (import estable).
4. Firmas de `format`, `parseISO`, aritmética y comparación **no cambian** para nuestro uso.
5. Requiere TS ≥ 5.0 y Node ≥ 18 (ya cumplimos).

## Plan de ejecución

### 1. Bump de dependencia
- `bun add date-fns@^4.1.0`
- Mantener `date-fns-tz@^3.2.0` (compatible con v4).

### 2. Verificación estática
- `tsgo` sobre el proyecto: revisar que ningún `format`/`parseISO` haya endurecido tipos (`Date | number | string` sigue vigente en v4; `parseISO` sigue devolviendo `Date`).
- Revisar `src/lib/utils.ts` (helper `nowMty` + `formatDateMty`) que combina `toZonedTime` + `format` con locale `es`: comportamiento idéntico en v4.
- Revisar `src/lib/domain/rentalCalculation.ts` (`differenceInCalendarMonths`, `addMonths`) — semántica preservada.

### 3. Puntos sensibles a validar manualmente
- **Calendario / Gantt** (`CalendarPage`, `GanttHeader`, `GanttRow`, `useGanttSegments`): asegurar que `startOfWeek` sigue tomando `weekStartsOn` (semana inicia lunes en es-MX).
- **PDFs** (`ContractDocument`, `CustomerStatementDocument`, `IncomeStatementDocument`, `customerStatement`, `Header`): formatos DD/MM/YYYY intactos.
- **Cash Flow** (`cashFlowUtils`): agrupamiento semanal con `startOfWeek`.
- **Recurring billing / MRR** (`useMrrDetail`, `rentalCalculation`): meses exactos vía `differenceInCalendarMonths`.

### 4. Testing
- Ejecutar la suite completa (`bunx vitest run`, 921 tests). Focos:
  - `schemas.zodResolver.test.ts` (fechas Zod).
  - Tests de `rentalCalculation`, `cashFlowUtils`, formatters de fecha (`formatMonthEs`, `formatDateMty`).
  - Snapshot/lógica de Gantt si existe.
- Smoke visual en preview: Calendar (mes/semana), MrrDetail, un PDF (Contrato o Estado de Cuenta).

### 5. Changelog
- Nueva entrada `v7.32.0` (minor: bump de dependencia mayor sin cambios de UI): index + `public/changelog/v7.32.0.json`.

## Riesgos
- **Bajo**. Nuestra API superficie usa funciones estables entre v3 y v4. `date-fns-tz@3.2` fue publicado justamente para puentear v3→v4.
- Si algún test de fecha falla por microsegundos de TZ, se ajusta puntualmente (no se espera).

## Entregable
- `package.json` con `date-fns@^4.1.0`.
- 0 warnings de tsgo/eslint nuevos.
- 921/921 tests verdes.
- Changelog `v7.32.0` publicado.
