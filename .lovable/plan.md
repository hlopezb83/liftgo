## Respuesta corta

No, todavía no. Lo entregado en las últimas rondas tiene pruebas **parciales**: la lógica pura nueva sí está cubierta, pero varias utilidades y comportamientos de UI quedaron sin red de seguridad.

## Qué SÍ tiene pruebas hoy (verificado)

- `src/features/crm/lib/stageMove.ts` → `stageMove.test.ts` (4 casos: mover, recompactar origen, índice fuera de rango, id inexistente)
- `src/features/crm/hooks/useProspectMutations.ts` → `useProspectMutations.test.ts` (7 casos)
- `src/features/reports/lib/drilldown.ts` → `drilldown.test.ts` (8 casos)
- `src/layouts/sidebar/isNavItemActive.ts` → `isNavItemActive.test.ts`
- E2E: 26 specs cubriendo facturación, portal, conciliación bancaria, roles, filtros y navegación

## Qué NO tiene pruebas (huecos detectados)

| Área | Archivo | Riesgo |
|---|---|---|
| Mensajes de error de auth del portal | `authErrorMessages.ts` | Medio — traducciones silenciosamente rotas |
| Orden de nulos en tablas | `createLiftgoSortingFn` | Medio — regresión de orden difícil de ver |
| Escalado de texto de KPIs | `kpiSizeClass` | Bajo — cosmético |
| Guardia "¿Descartar cambios?" | `FormDialog` (isDirty) | **Alto** — pérdida de datos del usuario |
| Estado de error con reintento | `QueryErrorState` | Medio |
| Estados vacíos con acción/filtros | `TableContent` | Medio |
| Kanban CRM optimista (extremo a extremo) | sin spec E2E de CRM | **Alto** — es el cambio más reciente |

## Plan propuesto

### Fase 1 — Pruebas unitarias de lógica pura (rápidas, sin DOM)
1. `authErrorMessages.test.ts`: mapeo de credenciales inválidas, email no confirmado, rate limit y fallback genérico en español mexicano.
2. `createLiftgoSortingFn.test.ts`: nulos/vacíos al final tanto en ascendente como descendente; empates estables; comparación de números vs texto.
3. `kpiSizeClass.test.ts`: valores cortos, medianos y largos devuelven la clase esperada.

### Fase 2 — Pruebas de componentes (Testing Library)
4. `FormDialog.test.tsx`: con `isDirty` y cierre por Esc aparece la confirmación; "Seguir editando" no cierra; sin cambios cierra directo; durante `isPending` el cierre se ignora.
5. `QueryErrorState.test.tsx`: renderiza mensaje y el botón "Reintentar" invoca el callback.
6. `TableContent.test.tsx`: con filtros activos muestra "limpiar filtros"; sin filtros muestra el ícono, el mensaje y el botón de creación.

### Fase 3 — E2E del Kanban de CRM
7. Nuevo `tests/e2e/crm-kanban.spec.ts`: arrastrar una tarjeta entre columnas activas verifica que se mueve al instante, que persiste tras recargar, y que soltar en "Cerrado ganado" abre el diálogo de cierre. Reutiliza el patrón de siembra y limpieza de `bank-reconciliation.spec.ts` para no dejar datos.

### Fase 4 — Cierre
8. Correr `bunx vitest run` y `bun run lint` completos; ajustar umbrales de cobertura en `vitest.config.ts` sólo si el CI lo exige.
9. Registrar la entrada en `public/changelog.json` y `public/changelog/v7.253.1.json` (patch: sólo pruebas, sin cambio funcional).

## Detalles técnicos

- Los tests de componente usan el mismo setup ya presente en el proyecto (Vitest + jsdom + Testing Library), con mocks de Supabase como en `useProspectMutations.test.ts`.
- El E2E de CRM necesita `dragTo` de Playwright sobre los `@dnd-kit` sortables; si el arrastre por mouse resulta inestable en CI, se usa el modo de teclado de dnd-kit (Espacio + flechas + Espacio), que es determinista.
- No se toca código de producción salvo agregar `data-testid` estables al Kanban si los selectores por rol no bastan.
