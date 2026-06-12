# Plan de remediación — CI y Tests (LiftGo)

5 lotes ordenados por ROI. Cada lote es independiente: si paramos en cualquier punto, lo entregado queda funcionando. Cada cambio cierra con entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.

---

## Lote A — Gates de seguridad en CI (alto ROI, bajo costo)

**Objetivo:** que ningún PR pueda romper tipos, formato Deno, ni introducir CVEs conocidos.

1. **`tsc --noEmit` en CI**
   - Añadir paso en el job `quality` de `.github/workflows/ci.yml` con `bunx tsc --noEmit -p tsconfig.app.json`.
   - Tiempo esperado: +30-60s.

2. **`deno lint` + `deno fmt --check`** en el job `edge-functions`.
   - Si hay deuda de formato existente, corregirla en un commit aparte antes de activar el gate.

3. **`bun audit`** en el job `quality` (continue-on-error inicialmente para no bloquear).
   - Reporte a summary del PR. Después de 1 sprint, hacerlo blocker.

4. **Subir thresholds Vitest a 13/12/10/13** (de 10/9/7/10) para reflejar el estado real y evitar regresión.

**Riesgos:** typecheck puede destapar errores acumulados (los resolvemos en Lote B). Mitigación: si son muchos, primero hacer `tsc --noEmit` con `continue-on-error: true` por 1 PR para inventariar.

---

## Lote B — TypeScript estricto (deuda Power-of-10)

**Objetivo:** alinear `tsconfig.app.json` con la doctrina ya declarada.

1. Activar gradualmente en `tsconfig.app.json`:
   - Paso 1: `noImplicitAny: true`
   - Paso 2: `strictNullChecks: true`
   - Paso 3: `strict: true` (incluye los anteriores + más)

2. Por cada paso, corregir errores. Heurística: la mayoría vendrán de:
   - Mocks en tests con `as unknown as X` → reemplazar por factories tipadas.
   - Funciones que reciben `data` de Supabase sin guardar contra `null`.
   - Catch blocks sin `unknown`.

3. Eliminar `as any` y `!` residuales (rg muestra ~ docena en tests viejos).

**Validación:** cero errores en `bunx tsc --noEmit`, suite 503/503 sigue verde, `bunx vitest run` en CI sigue pasando.

---

## Lote C — Refactor `_shared/cfdi/` y tests de cancelación

**Objetivo:** deduplicar 4 handlers Facturapi y cerrar el gap fiscal crítico.

1. **Extraer helpers compartidos en `supabase/functions/_shared/cfdi/`:**
   - `authGate.ts` → `requireAdmin(req, deps)` retorna `{ userId }` o `Response` 401/403.
   - `facturapiKeyResolver.ts` → `resolveFacturapiKey(supabase, env)` retorna `{ apiKey, mode }` o `null`.
   - `storage.ts` → `uploadCfdiArtifacts(supabase, facturApiId, baseDir, apiKey, fetchImpl)` retorna `{ xmlPath, pdfPath }`.

2. **Refactor de los 4 handlers actuales** (`stamp-cfdi`, `stamp-credit-note`, `stamp-payment-complement`, `cancel-payment-complement`) para usar los helpers. Resultado esperado: -200 LOC duplicado.

3. **Tests nuevos para funciones críticas sin cobertura real:**
   - `cancel-cfdi/handler.ts` + `handler_test.ts` (8-9 casos como stamp-credit-note).
   - `cancel-credit-note/handler.ts` + `handler_test.ts` (la función ni siquiera tiene smoke hoy).
   - `generate-recurring-invoices/handler.ts` extraer lógica de fechas + tests unitarios (cubre cálculo de ciclos mensuales, casos de fin de mes).

4. **Extender `_shared/test/supabaseClientMock.ts`** para soportar:
   - `.rpc(name, args)` con respuestas configurables por nombre.
   - Múltiples respuestas secuenciales por tabla (cola FIFO) para tests que hacen varios `.select()` al mismo recurso.
   - Errores RLS simulados (`{ code: '42501' }`).

**Validación:** todos los handler_test verdes; cobertura de funciones críticas pasa de smoke a comportamiento real.

---

## Lote D — Cerrar gaps de cobertura por feature

**Objetivo:** atacar los módulos 🔴 sin tests.

Por orden de impacto:

1. **`features/returns/`** — hooks de inspección de retorno, cálculo de daños/horómetro, marca de DEV-XXXX. 6-8 unit tests + 1 integración.
2. **`features/damage/`** — hooks `useDamageRecords`, transición de estados, cálculo de costo de reparación. 5-7 unit tests.
3. **`features/portal/`** — hooks read-only del cliente (`useMyInvoices`, `useMyPayments`). 4-5 unit tests + activar `tests/e2e/portal.spec.ts`:
   - Añadir bloque al RPC `e2e_seed_scenario` que cree un usuario portal con `customer_id` ligado al cliente seed.
   - Quitar `test.skip()` y validar listado de facturas + descarga.
4. **`features/accounts-payable/`** y **`features/operations/`** — al menos smoke tests de hooks principales.

5. **Sanear tests frágiles existentes** identificados por el subagente:
   - `cfdiPrechecks.test.ts`: reemplazar `as unknown as Invoice` por factory.
   - `InvoicesPage.test.tsx`: cambiar asserts por `textContent` a `getByRole`/`getByTestId`.

**Validación:** cobertura sube; mapa por feature pasa de 🔴 a 🟡 mínimo en los 5 módulos atacados.

---

## Lote E — Limpieza de ruido y mantenimiento

1. **Reemplazar smoke tests redundantes `index_test.ts`** (CORS + 401) por un helper compartido `_shared/test/smokeSuite.ts` que reciba `fnName` y genere los 2 casos. Reduce ~150 LOC de boilerplate.

2. **Script de limpieza E2E** para basura por crash:
   - Cron en CI (job semanal) que ejecute un RPC `e2e_teardown_stale(p_prefix => 'w', p_older_than => '24 hours')` que purge filas con `e2e_scope` antiguas.

3. **Lighthouse CI** (opcional, baja prioridad): activar `scripts/lighthouse-baseline.sh` en un job nocturno para detectar regresiones de performance.

4. **Subir thresholds Vitest a 20/18/15/20** una vez los lotes D estén entregados (objetivo intermedio; meta final 30% en lotes posteriores).

---

## Detalles técnicos clave

- **No cambiamos** `supabase/config.toml`, ni el `client.ts`/`types.ts` autogenerados.
- **No agregamos** anon grants nuevos: los helpers `_shared/cfdi/` no tocan DB schema.
- **Convención de versiones:** cada lote es una versión `minor` (`6.44.0`, `6.45.0`, ...), cada paso intermedio es `patch`.
- **Orden de mergeo:** A → B → C → D → E. A y B se pueden traslapar si typecheck no destapa demasiado.
- **Sin cambios visuales** para el usuario final en ningún lote.

---

## Métricas de éxito

| Métrica | Hoy | Meta post-plan |
|---|---|---|
| Typecheck en CI | ❌ | ✅ blocker |
| `strict: true` | ❌ | ✅ |
| Edge functions con handler test real | 4/15 | 8/15 |
| Features 🔴 sin tests | 6 | 1-2 |
| Coverage thresholds | 10/9/7/10 | 20/18/15/20 |
| LOC duplicado en handlers Facturapi | ~600 | ~400 |
| E2E portal | skip | activo |

---

## Out of scope (lote futuro)

- Migrar a `pg-mem` para tests de filtrado real (mencionado por subagente; alto costo, ROI medio).
- Subir thresholds a >50% (requiere meses de trabajo sostenido).
- Reescribir tests de integración como E2E full (caro y lento).
- Lighthouse blocker (solo informativo por ahora).

---

## Pregunta abierta

¿Procedo lote por lote pidiendo confirmación entre cada uno, o autorizas correr A+B seguidos (los más mecánicos) y paramos para revisar antes de C?
