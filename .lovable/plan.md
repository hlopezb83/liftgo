# Validación de la alerta "Equipos sin costo de adquisición"

## Veredicto: la alerta es REAL, pero apunta a datos contaminados

La alerta del Estado de Resultados **no es un falso positivo**: los dos montacargas (`E2E-FL-2129da5e`, `E2E-FL-34dcc8a8`) sí existen en la BD con `acquisition_cost = 0` y sí tienen reservas activas, por lo tanto el RPC `get_income_statement` los marca correctamente.

El problema es **qué hacen ahí**: son datos sembrados por la suite Playwright (`e2e_seed_scenario`) que nunca se limpiaron. Verificación en BD:

| name | is_e2e | e2e_scope | created_at | acquisition_cost |
|---|---|---|---|---|
| E2E-FL-f93ac1aa | true | w3-921d6224-wwez | 2026-06-12 23:13 | 0 |
| E2E-FL-54e4fd4d | true | w1-921d6224-o0vx | 2026-06-12 23:13 | 0 |
| E2E-FL-2129da5e | true | w3-921d6224-0ane | 2026-06-12 23:01 | 0 |
| E2E-FL-34dcc8a8 | true | w1-921d6224-jmvg | 2026-06-12 23:01 | 0 |

Más residuos en cadena: 4 bookings, 4 invoices, 4 quotes, 4 customers, 4 equipment_models, 28 activity_feed — todos con `is_e2e = true` y los mismos scopes.

## Causas raíz (dos capas)

**1. Los reportes financieros NO filtran `is_e2e = true`.**
El RPC `get_income_statement` agrega de `invoices`, `bookings`, `forklifts`, `maintenance_logs`, `damage_records`, `supplier_bills` sin excluir filas marcadas como E2E. Cualquier dato de prueba que sobreviva al teardown se cuela al P&L. Probablemente ocurre lo mismo en otros RPCs/queries de reportes (MRR, cash flow, dashboard).

**2. El teardown de Playwright se salta cuando el worker muere.**
En `tests/e2e/fixtures/seed.ts`:

```ts
seed: async ({ page }, use, testInfo) => {
  const scope = buildScope(testInfo);
  const ids = await seedScenario(page, scope);
  await use(ids);                 // ← si Playwright mata el worker aquí
  await teardownScenario(...);    // ← esta línea nunca corre
},
```

Los testId repetidos (`921d6224` en w1 y w3, dos corridas distintas) confirman que el mismo spec se interrumpió a media corrida — el dev server probablemente lo desconectó. El teardown debe ir en `try/finally` y la suite debería tener un seguro de "purga por prefijo `E2E-`" al inicio de cada corrida, no solo por scope.

## Plan de remediación, ordenado

### Paso 1 — Limpieza inmediata de la contaminación visible (data)
Ejecutar `purge_e2e_data()` (ya existe desde v6.46.6) para barrer las 4 forklifts + cadenas asociadas + activity_feed. La alerta del P&L desaparece en cuanto se borren.

### Paso 2 — Blindar reportes contra residuos E2E (alto impacto)
Modificar `get_income_statement` para añadir `AND COALESCE(is_e2e, false) = false` en:
- `inv` (CTE de facturas)
- `active_bookings` (CTE de reservas)
- subquery final `v_rented_without_cost` (forklifts)
- `maintenance_logs`, `damage_records`, `supplier_bills` (aunque hoy no tienen `is_e2e`, dejarlo previsto)

Después de esto, aunque queden datos E2E olvidados, **nunca contaminarán el Estado de Resultados**.

Auditar y aplicar el mismo filtro a:
- RPCs/queries del dashboard (MRR, KPIs)
- RPC de cash flow
- Página `/mrr`
- Reportes de utilización

### Paso 3 — Endurecer el teardown de Playwright (alto impacto)
En `tests/e2e/fixtures/seed.ts`:

```ts
seed: async ({ page }, use, testInfo) => {
  const scope = buildScope(testInfo);
  const ids = await seedScenario(page, scope);
  try {
    await use(ids);
  } finally {
    await teardownScenario(page, scope).catch((e) => {
      // log pero no enmascarar el fallo del test original
      console.error(`[e2e] teardown falló para ${scope}:`, e);
    });
  }
},
```

Agregar un `globalTeardown` en `playwright.config.ts` que ejecute `purge_e2e_data()` al final de toda la suite como red final.

### Paso 4 — Recordatorio en el aviso del P&L (opcional, baja prio)
Si después del paso 2 sigue mostrándose la alerta, significa que hay forklifts **reales** sin costo. Pero hoy el mensaje no distingue entre olvido administrativo y basura de pruebas. Podríamos agregar al texto un hint del tipo "(si son equipos de prueba, archívalos o asígnales costo cero explícito)". No bloqueante.

---

## Recomendación

Empezar por los pasos 1 + 2 + 3 en la misma entrega: borra el problema visible **y** lo previene a futuro tanto a nivel de datos (reports) como a nivel de proceso (tests). Aprueba para implementar.
