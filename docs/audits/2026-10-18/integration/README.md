# Auditoría Lift GO: integración y evidencia

Repositorio `hlopezb83/liftgo`. Base auditada y `main` remoto verificado al inicio y antes del push: `ec177edf865671a9e9952f5cccd56a9db687f0bd`. El directorio de tarea estaba vacío; se clonó el repositorio y se trabajó en ramas/worktrees separados. No se sobrescribieron cambios ajenos.

- Código corregido y validado: **`daa45335df358fdd4eac0a99a2e2515a470af909`**, [PR #274](https://github.com/hlopezb83/liftgo/pull/274), rama `fix/audit-eleven-20261018`.
- K1 separado: **`4a5ec92578d8e8eca87af7b610c900d6aabec34d`**, [PR #273](https://github.com/hlopezb83/liftgo/pull/273), propuesta pendiente de revisión y aprobación específica. No es un arreglo aplicado.
- Este commit de integración sólo agrega evidencia. Los archivos de producto y prueba conservan los blobs del SHA de código anterior.
- Entorno local: ASUS/Windows, PowerShell, Node `v24.19.0`, Bun `1.4.0`, Vitest `4.1.11`. Instalación fijada por `bun.lock`, sin cambios de dependencias.

## Cambios y evidencia comparable

Todas las ubicaciones siguientes corresponden al SHA de código `daa45335...`; los registros por bloque conservan también sus SHA originales antes del cherry-pick, comandos exactos y logs completos.

| Hallazgo | Ubicación principal | Comportamiento corregido | Evidencia ejecutada |
| --- | --- | --- | --- |
| N1 | `src/features/invoices/components/invoice-detail/InvoiceDetailBody.tsx:68`; `src/features/invoices/hooks/invoices/useInvoicesFilters.ts:25`; `src/components/layout/DetailPageHeader.tsx:24` | Se captura URL de origen desde escritorio/móvil y se conservan búsqueda/filtros; fallback de sesión para acceso directo. | [N1/N4](../navigation/n1-n4/README.md): base con 10 fallos / 22 pases; después 32/32. |
| N2 | `src/features/reports/hooks/incomeStatement/types.ts:143` y consumidores de tablas, comparativos, CSV y PDF | Los márgenes son `null` cuando ingresos <= 0 y se presentan como `No aplica`. Los importes y totales monetarios se conservan. | [N2/N3](../reports/README.md): base 10 fallos / 4 pases; después 14/14; regresión 94/94. PDF probado con renderer simulado. |
| N3 | `src/features/reports/components/reports/IncomeStatementReport.tsx:114` | La advertencia de depreciación faltante aplica a Devengado. La alerta de costo de equipos vendidos conserva ambos contextos. | Mismos casos N2/N3, incluidos avisos por base contable. |
| N4 | `src/features/bookings/components/bookings/BookingActions.tsx:129` | Sin transiciones, Cambiar estatus queda bloqueado con motivo legible y accesible. No se amplía la máquina de estados. | Mismos casos N1/N4, incluida reserva completada. |
| N5 | `src/features/calendar/hooks/useCalendarLocationState.ts:16`; `src/features/bookings/pages/BookingDetail.tsx:25`; `src/features/calendar/components/calendar/GanttRow.tsx:75` | URL y sesión conservan fecha/vista/rango; Volver desde reserva respeta origen Calendario. | [N5/N6](../navigation/n5-n6/README.md): base 6 fallos / 5 pases; después 11/11. Navegación conjunta final 43/43. |
| N6 | `src/features/calendar/pages/CalendarPage.tsx:103`; `src/features/calendar/components/calendar/GanttCard.tsx` | Toolbar y controles de periodo permanecen montados durante cargas/errores; el skeleton se limita al contenido. | Mismos casos N5/N6, con identidad del control y foco durante cambio de rango. |
| N7 | `src/features/invoices/lib/paymentCurrency.ts:23` | Conversión y redondeo de cada pago antes de sumar, como `fx_convert_amount` de la vista SQL. Moneda heredada y TC faltante coherentes con esa vista. | [N7/N8](../payments/README.md): helpers base 8 fallos / 8 pases; después 16/16. Caso sintético USD100, TC17.5, dos pagos MXN1: `.11` antes frente a `.12` después. |
| N8 | `src/features/invoices/components/invoice-detail/validateEditPaymentAmount.ts:25`; `EditPaymentDialog.tsx:89`; `InvoicePaymentSummary.tsx` | Candidato, contribución original y saldo se comparan en moneda de factura; la tolerancia se aplica allí. El máximo sólo se convierte para el mensaje. Guardas REP y servidor conservadas. | Diálogo base 3 fallos / 1 pase; después 4/4; regresión inicial 42/42. Frontera adicional: 3 fallos sobre arreglo intermedio -> 3/3; focal final 23/23. |
| K2 | `src/features/fleet/hooks/forklifts/useForkliftFinancials.ts:45`; `src/features/fleet/pages/ForkliftDetail.tsx:125` | Oculta datos en el mismo render al perder acceso, impide refetch sin permiso, cancela/remueve caché financiera y protege resumen/historial. Purga global de identidad/empresa intacta. | [K2](../financial-access/README.md): mismo QueryClient admin→mechanic, rol no resuelto y respuesta tardía: 4 fallos antes -> 9/9 después; regresión 106/106. |
| K3 | `src/lib/observability/privacyOptions.ts:4`; `databasePrivilegeFailure.ts:4`; `captureOperationalError.ts`; `serverSentry.server.ts` | Lista explícita de validaciones, conserva desconocidos/fatal/cadenas mixtas; sólo considera técnico un 403 con evidencia estructurada de privilegio concreto y sanea el incidente. | [K3](../privacy/README.md): 11 fallos / 21 pases en base -> 32/32; regresión 72/72. Incluye datos sensibles y comportamiento cliente/servidor. |

El ejemplo N8 USD100/TC17.5, saldo USD90 y pago original MXN175 permite editar a MXN350; el máximo nominal pasa de 265 mezclando monedas a MXN1750. Los casos de centavos agregados rechazan USD1.01 contra factura MXN17.50 y aceptan MXN1750.02 cuando su conversión canónica redondea a USD100. Todo es sintético, con mutaciones de UI simuladas; no acredita escrituras publicadas. La aritmética heredada del trigger SQL de validación de pagos sigue intacta y se señala en el registro de pagos para revisión del coordinador.

## Gate integrado sobre el SHA de código final

| Control | Resultado | Evidencia |
| --- | --- | --- |
| Archivos de prueba cambiados | **22 archivos, 126/126 pases**, exit 0 | `changed-test-files.txt`, `final-changed-tests.txt` |
| ESLint global, cero advertencias | **exit 0** | `final-lint.txt` (sin salida) |
| TypeScript aplicación | **exit 0** | `final-typecheck.txt` (sin salida) |
| TypeScript pruebas de navegador | **exit 0** | `final-browser-typecheck.txt` (sin salida) |
| Build local apuntando a backend inexistente loopback | **exit 0**, cliente y SSR | `final-build.txt` |
| Changelog 8.44.7 preparado para el cambio | **exit 0** | `changelog-check.txt` |
| Guardrails G1–G5 equivalentes en Node/PowerShell | **exit 0**, 1355 archivos de features revisados | `final-architecture-equivalent.txt`; bash/rg no están en PATH local |
| CI remoto completo | **success** | [CI 39172070833](https://github.com/hlopezb83/liftgo/actions/runs/39172070833), snapshot `ci-code-head.json` |
| Gitleaks | **success** | [Gitleaks 39172070728](https://github.com/hlopezb83/liftgo/actions/runs/39172070728) |

El CI confirma jobs/steps ejecutados: ESLint, aplicación y browser-tests typecheck, arquitectura, build, smoke de arranque con Chromium en el runner remoto, **6/6 shards Vitest** y consolidación/umbrales de cobertura. Jobs de Deno, migraciones y Actionlint aparecen skipped por alcance; no se presentan como ejecutados. El gate multiempresa es otro workflow y su estado se informa aparte en el PR/handoff.

La corrida local completa se detuvo al confirmarse los seis shards y cobertura aprobados en CI sobre el mismo código. **No hay un pase local de suite completa.** Su registro parcial se conserva en `attempt-final-all-tests-stopped-after-ci.txt`. Otras corridas interrumpidas se conservan en `attempt-interrupted-tests.txt` y `attempt-pre-cent-boundary-all-tests.txt`; ninguna cuenta como pase global.

Una corrida anterior con build/tipos concurrentes registró un fallo en la prueba bancaria de foco de fila virtualizada (5818ms). El archivo y componente tienen blobs idénticos en base/corrección. La comparación dirigida dio 11/11 en base y 11/11 en integración; [comandos, tiempos y límites](bank-baseline/README.md). La causa de carga/timeout es una hipótesis, no una conclusión demostrada. El CI final completo aprobó. No se alteró ese módulo ni se aumentó su timeout.

`attempt-fixture-typecheck.txt` conserva el único fallo de tipos encontrado al integrar: un fixture nuevo MXN usaba exchange_rate null frente al tipo number; se corrigió a 1 y se repitieron tipos y pruebas. Los logs `pre-cents-*` corresponden al gate anterior al último ajuste N8 y no sustituyen las verificaciones finales.

### Comandos finales locales exactos (PowerShell, desde liftgo)

```powershell
$env:TEMP = Join-Path (Get-Location) '.tool-tmp'
$env:TMP = $env:TEMP
$auditTestFiles = @(git diff --name-only origin/main -- '*.test.ts' '*.test.tsx')
node node_modules/vitest/vitest.mjs run @auditTestFiles --maxWorkers=4
node node_modules/eslint/bin/eslint.js . --max-warnings=0 --ignore-pattern '.bun-cache/**' --ignore-pattern '.tool-tmp/**'
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.browser-tests.json
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_offline'
$env:VITE_SUPABASE_PROJECT_ID = 'test-offline'
node node_modules/vite/bin/vite.js build
node scripts/validate-changelog.ts
git diff --check
```

Se redirigió cada comando a su archivo indicado mediante `*> <archivo>` y se verificó `$LASTEXITCODE`; el proceso de pruebas imprimió changed-tests=0, tipos imprimieron typecheck=0/browser-typecheck=0, lint imprimió lint=0 y build imprimió build=0. El archivo vacío de un control sin diagnósticos representa ese exit 0 verificado, no una prueba que se dejó de ejecutar.

Las dependencias se instalaron con `bun install --frozen-lockfile`, usando BUN_TMPDIR/BUN_INSTALL/cache dentro del checkout. Windows exigió escalación para instalación, junctions, algunos accesos locales y PostgreSQL efímero; todas fueron aprobadas. Los fallos iniciales de preparación (EBADF, Access denied, EPERM) no se cuentan como regresiones funcionales. No hubo rechazo de auto-review.

## K1 y riesgo de SELECT fuera del alcance

K1: [PR273](https://github.com/hlopezb83/liftgo/pull/273), head `4a5ec925...`, conserva la propuesta de una columna fuera de carpetas de migración. SELECT de catálogo del conector existente identifica el proyecto Lovable Lift GO `e25ace4a-172e-4082-a037-00473dacf2f2`, backend Supabase/base postgres, con discount_update false, total_update true, UPDATE global/aprobación false y RLS enabled/forced true. El fixture local v2 da exit3 antes -> exit0 después, **22 PASS + 3 LIMIT**, con SELECT de valores, estados y pagos, y cluster detenido. K1 sigue pendiente: el permiso aislado permite cambiar discount sin total en estados protegidos, SQL no impone descuento<=subtotal y el helper administrativo actual no consulta perfil activo. Deben revisarse antes de aprobar; no se agregaron guardas nuevas ni permisos publicados. La asociación proyecto/backend no prueba por sí sola el destino que consume el navegador publicado.

La lectura de catálogo adicional de Flota (`conditional-forklift-cost-select.json`) confirma que authenticated tiene SELECT de acquisition_cost e insurance_cost y existen policies de filas para mechanic/ventas/dispatcher/auditor, sujetas a rol, is_e2e y organización. `useForklifts.ts` ya pide esas columnas. Esto sustenta el riesgo condicional de acceso directo a costos si un usuario válido satisface esas policies; no se simularon sesiones reales ni se leyeron filas de equipos. Está fuera de los once hallazgos autorizados: no se modificaron sus permisos, consultas ni policies.

## Estado de entrega

Diez hallazgos de código corregidos y revisables en PR274; K1 investigado/propuesto y pendiente en PR273. Revisión independiente de sólo lectura completada sin bloqueos nuevos de esos diez. Todos los subagentes finalizaron; ninguno quedó trabajando en segundo plano. Ningún merge, despliegue, migración publicada, cuenta real o transacción de negocio ejecutados. No se operó Chrome del ASUS ni se regeneraron capturas; el QA visual/publicado queda con el padre. Revisión/merge, autorización de permisos y publicación corresponden al coordinador.
