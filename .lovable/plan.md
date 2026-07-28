## Objetivo

Validar de punta a punta —y visualmente— el módulo de Conciliación Bancaria, dejando la base de datos exactamente como estaba: cada movimiento creado por las pruebas se borra al terminar.

## Contexto verificado

- Ya existe infraestructura Playwright (`tests/e2e/`, `fixtures/seed.ts`, `global.teardown.ts`, `playwright.config.ts` con scopes por test).
- Las tablas `bank_accounts`, `bank_statement_imports` y `bank_statement_lines` **no** tienen columnas `is_e2e` / `e2e_scope`, así que el purgado global existente no las toca: la limpieza debe hacerse por ID desde el propio fixture.
- El módulo (`src/features/bank-reconciliation/`) hoy no expone ningún `data-testid`, por lo que los selectores serían frágiles.
- La suite visual (`visual-desktop.spec.ts`) está apagada por diseño con el gate `E2E_VISUAL=1` (los baselines dependen del runner).

## Plan

### 1. Fixture de datos bancarios con auto-limpieza
Nuevo `tests/e2e/fixtures/bankSeed.ts`:
- Crea, con la sesión admin del test, una cuenta bancaria temporal (nombre con sufijo aleatorio + marca `TMP_E2E_<scope>` en `notes`), una importación y 4 líneas de estado de cuenta: un abono que coincide exacto con un pago real, uno con monto aproximado, un cargo (comisión) y una línea sin candidatos.
- Devuelve los IDs al test.
- En el teardown del fixture borra **siempre** (aunque el test falle) en orden de FK: primero desmarca líneas conciliadas, luego líneas → importación → cuenta. Falla ruidosamente si algo queda, siguiendo el patrón de `seed.ts`.
- Red extra: barrido inicial que elimina cualquier cuenta con `notes LIKE 'TMP_E2E_%'` huérfana de corridas anteriores.

### 2. Testids estables en el módulo
Agregar `data-testid` (sin cambios de comportamiento ni de estilo) en: workspace, tabla de líneas, fila de línea, panel de emparejamiento, lista de candidatos, botón Emparejar, tarjetas de KPI y pestañas de estado.

### 3. Spec funcional `tests/e2e/bank-reconciliation.spec.ts`
Casos:
1. La página carga, se selecciona la cuenta temporal y los KPIs muestran cargos/abonos/neto y "% conciliado" acordes a las líneas sembradas.
2. Filtrado por pestañas de estado (Todas / Sin emparejar / Sugerido / Conciliado / Ignorado) y búsqueda por texto/referencia/monto.
3. Selección de filas: el checkbox se ve marcado, el contador y la barra de acciones masivas responden (regresión del bug corregido en v7.246.1).
4. Panel de emparejamiento: al elegir una línea aparecen candidatos con score y etiquetas ("Monto exacto", "Mismo día"); emparejar mueve la línea a "Conciliado" y actualiza el % conciliado.
5. Ignorar líneas seleccionadas con razón obligatoria.
6. Atajos de teclado J/K para navegar y Enter/C para confirmar.
7. Sin errores de consola ni toasts de error en todo el flujo.

### 4. Validación visual
- Snapshots del workspace (lista + panel) y de un estado vacío, en 1600x900, dentro del gate `E2E_VISUAL=1` y con máscaras para montos/fechas dinámicas, para no romper el CI actual.
- Adicionalmente, durante la implementación haré una revisión visual manual con capturas de pantalla del flujo completo y te las reporto.

### 5. Cierre
- Ejecutar `bunx playwright test bank-reconciliation`, typecheck y lint.
- Verificar por consulta a la base que no quedó ninguna cuenta/línea temporal.
- Entrada nueva en `public/changelog.json` + `public/changelog/v7.247.0.json` (minor: nueva cobertura de pruebas).

## Detalles técnicos

- El fixture extiende `base.extend<{ bank: BankSeedIds }>` reutilizando `getAuthToken` de `fixtures/helpers.ts` y el cliente Supabase con el token del navegador (mismo patrón que `seed.ts`), sin service role.
- Las líneas se generan con `hash` único por scope para no chocar con la restricción de deduplicación de importaciones.
- El emparejamiento en el test usa la UI (RPC `confirm_bank_matches` a través del botón), no llamadas directas, para que la prueba valide de verdad el camino del usuario.
