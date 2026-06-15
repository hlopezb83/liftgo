# Fix Gitleaks: 2 falsos positivos por JWT anon (publishable)

## Diagnóstico

El workflow `.github/workflows/gitleaks.yml` está marcando 2 "leaks":

1. `.env` línea 2 — `VITE_SUPABASE_PUBLISHABLE_KEY` (JWT con rol `anon`)
2. `tests/e2e/fixtures/seed.ts` línea 22 — el mismo JWT anon embebido para los tests E2E

Ambos son la **publishable/anon key** de Supabase. Por diseño es pública (se sirve al navegador) y Lovable Cloud la considera segura en código. Gitleaks la marca solo porque coincide con el patrón genérico `jwt` (entropía 5.5). No hay fuga real.

## Solución

Agregar `.gitleaks.toml` en la raíz que:

1. Extiende la config default de Gitleaks (mantiene todas las demás reglas activas).
2. Agrega un `allowlist` global que ignora:
   - Cualquier match cuyo **secret decodificado** contenga `"role":"anon"` (regex sobre el contenido del JWT) — esto cubre `.env`, `seed.ts` y cualquier futuro lugar donde aparezca la anon key sin tener que mantener una lista de fingerprints.
   - Los dos `fingerprints` exactos del reporte actual como red de seguridad por si el contenido del JWT cambia de formato.
   - Las rutas `tests/e2e/fixtures/**` y `.env` (solo para la regla `jwt`) como tercera capa, para evitar que se vuelva a romper si se rota la key.

Resultado esperado: el job de Gitleaks pasa con 0 leaks, y se siguen detectando JWTs con rol `service_role`, `authenticated` o cualquier otro secreto real.

## Cambios

### Archivos nuevos
- `.gitleaks.toml` — config con allowlist descrita arriba.

### Archivos editados
- `public/changelog.json` — entrada **v6.75.1** (patch).
- `public/changelog/v6.75.1.json` — detalle: "CI: silenciar falsos positivos de Gitleaks por anon key publishable".

### Sin cambios
- No se toca `.env`, `seed.ts`, ni `gitleaks.yml`.
- No se rotan keys (la anon key es pública por diseño).

## Validación

Al hacer push, el workflow `Detectar secretos` debe terminar verde (`leaks found: 0`).
