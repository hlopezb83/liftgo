# Bloque A — Gates de calidad pre-RC

Objetivo: cerrar los gates objetivos (linter, seguridad, tests de backend, deuda de dependencias) para que el RC pueda declararse estable con respaldo verificable.

## 1. Linter de Supabase + Security Scan

- Correr `supabase--linter` y `security--run_security_scan`.
- Para cada finding:
  - Si es real → migración SQL que lo corrija (search_path faltante, índices, policies).
  - Si es no aplicable en este contexto (prototipo demo / personal interno) → `manage_security_finding` con explicación + actualizar `security--update_memory`.
- Resultado esperado: linter verde, scan sin findings críticos/altos abiertos.

## 2. Limpieza de dependencias y warnings

- Eliminar `jspdf` y `jspdf-autotable` de `package.json` (migración a `@react-pdf/renderer` ya completa desde v6.6.0-alpha.1; confirmado en código).
- Actualizar `mem://tech/security/vulnerabilities` y `mem://tech/stack` para reflejar la eliminación.
- Pasada de los 51 warnings de complejidad/max-lines remanentes (v5.80.2): refactor donde sea trivial (early returns, extracción de helpers); suprimir con justificación inline donde no aporte valor.
- Meta: 0 warnings de ESLint, build limpio.

## 3. Tests de Edge Functions críticos

Crear `*_test.ts` con Deno test para las funciones donde un bug duele más:

- `stamp-cfdi` — happy path (timbra), error de Facturapi, validación de input (Zod), auth requerida.
- `cancel-cfdi` — happy path, motivo inválido, sin permisos.
- `generate-recurring-invoices` — genera para suscripción activa, no duplica en mismo mes, respeta tarifa actual.
- `invite-customer` / `invite-user` — crea usuario, asigna rol, idempotencia ante email duplicado.
- `delete-user` — restringido a admin, limpia roles, no permite auto-borrado.
- `reset-user-password` — admin-only, no expone error crudo (v5.81.8).
- `parse-csf` — parseo válido + payload corrupto.

Patrón: usar `Deno.test` + `dotenv/load.ts` + `fetch` contra la función desplegada con header `Authorization` explícito por rol. Mock de Facturapi vía variable de entorno test (ya soportado).

## 4. CI gates

- Añadir step al workflow `.github/workflows/ci.yml`:
  - `supabase--test_edge_functions` (Deno tests) como job paralelo a `quality`.
  - Job opcional `supabase-linter` (informativo).
- Actualizar `.github/pull_request_template.md` con checklist de RC.

## 5. Documentación y changelog

- Actualizar `architecture.md` §15 (Testing) agregando subsección "Edge Functions" con convención de tests.
- Nueva entrada `v6.13.0` (minor — agrega cobertura de tests E2E backend) con:
  - JSON detalle en `public/changelog/v6.13.0.json`.
  - Entrada en `public/changelog.json`.
- Actualizar `mem://tech/testing` para incluir tests de Edge Functions.

## Detalles técnicos

```text
Orden de ejecución:
  Paso 1 (linter + scan)  → migraciones SQL si aplica
       │
       ▼
  Paso 2 (jspdf + warnings) → bun remove + refactor
       │
       ▼
  Paso 3 (tests Edge)     → supabase/functions/*/index_test.ts
       │
       ▼
  Paso 4 (CI)             → .github/workflows/ci.yml
       │
       ▼
  Paso 5 (docs + changelog v6.13.0)
```

Verificación final:
- `bun run lint` → 0 errores, 0 warnings.
- `bunx vitest run` → 296+ tests verdes.
- `supabase--test_edge_functions` → todos los tests Deno verdes.
- `supabase--linter` → verde.
- `security--get_scan_results` → sin findings críticos/altos abiertos.

## Fuera de alcance (queda para Bloque B/C)

- Tests E2E de UI (Playwright).
- Migración de `useFormState` a `react-hook-form` (sigue marcada como deuda).
- QA mobile real, Lighthouse, runbooks de operación, restore de backup.
