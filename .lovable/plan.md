## Bloque 5 — Mejoras / Pulido

Divido el bloque en dos fases porque tiene 7 sub-items con impactos y decisiones muy distintas. Ejecuto ahora la **Fase 5A** (todo lo seguro y sin decisiones bloqueantes). La **Fase 5B** requiere input tuyo antes de tocar código.

---

### Fase 5A — Ejecución inmediata

**MP-M3 · Arranque más ligero (impacto alto, riesgo bajo)**
`AuthSnapshotSync.tsx` hoy hace `fetch("/changelog.json", { cache: "no-store" })` (~380 KB) solo para leer `data[0].version`. Además `errorReport.ts` también lo lee.
- Generar `public/version.json` en el build (script Node en `scripts/gen-version.mjs` que lee `public/changelog.json[0].version` y escribe `{"version": "x.y.z"}`).
- Wire en `package.json`: `"prebuild": "node scripts/gen-version.mjs"` y también correr en dev vía `predev` (o al arrancar Vite con un plugin ligero).
- `AuthSnapshotSync.tsx` y `errorReport.ts` cambian a `fetch("/version.json", { cache: "no-store" })`.
- Fallback: si `version.json` falta (dev sin prebuild), degradar silenciosamente a `"dev"`.

**MP-M5 · Logout determinista**
En `AuthContext.signOut()` (o el hook equivalente):
- Después de `supabase.auth.signOut()`, ejecutar `localStorage.removeItem("liftgo:rq-cache:v1")` y llamar `persister.removeClient()` si está expuesto.
- Sacar `customers` y `suppliers` de la allowlist del `persister` (privacidad de datos de cliente entre sesiones en dispositivos compartidos).

**MP-A1 · Abstracción del gateway de IA**
- Nuevo `supabase/functions/_shared/ai.ts` con:
  - `AI_ENDPOINT` y `AI_API_KEY` desde `Deno.env` (default a Lovable AI Gateway).
  - `chatCompletion(messages, { model, response_format? })` que retorna JSON parseado o texto.
  - Manejo estándar de 429/5xx (retry exponencial 3 intentos).
- Migrar `parse-csf`, `parse-cfdi-expense`, `classify-feedback-report`, `generate-manual` a usar el helper (elimina 4 duplicados de fetch + headers + parsing).
- **Sin cambio funcional** — comparar respuestas ANTES/DESPUÉS con curl para 1 request de cada función.
- Documentar en el aviso de privacidad (`src/pages/Privacy` si existe, o helpers de textos legales) que los documentos fiscales se procesan con IA externa.

**Bajos**
- `documentsQueryKeys.ts` / hook de documentos: reemplazar loop de `createSignedUrl` por `createSignedUrls([...paths], expiresIn)` (una llamada, hasta 100 paths).
- `DragDropImageUploader` y `DocumentAttachments`: cambiar `for..await upload` por `Promise.allSettled(files.map(upload))` — reporta errores parciales sin abortar el batch.
- Eliminar scripts `audit_*.mjs` / `visual_audit*.mjs` de la raíz (verifico antes con `ls` que ninguno sea referenciado por `package.json`/CI).
- Reescribir `README.md`: stack real (React 18 + Vite 5 + Tailwind v3 + Lovable Cloud), scripts (`bun dev`, `bun test`, `deno test supabase/functions`), dominio CFDI (Facturapi live/test, roles, timbrado), enlaces a `/help` y `/changelog`.
- Mover `src/features/customer-portal/*.test.ts` (test huérfano) a `src/features/portal/`.
- Consolidar los formatters de fecha dispersos en `lib/format/dates.ts` (single source; ya existe `formatMonthEs.ts`, agregar `formatDateShort`, `formatDateTime`, `formatRelative`).
- `lovable-tagger` / `componentTagger`: verificar si aparece en el árbol de imports; si nadie lo importa, quitarlo de `package.json` y `vite.config.ts`.

**Verificación 5A**
- `tsgo --noEmit`, `bun run lint`, `bun run test` verdes.
- `deno test supabase/functions/_shared` para el nuevo helper.
- Curl smoke: `parse-csf` con un CSF de prueba (ya hay uno en /mnt/user-uploads).
- Playwright smoke: login → logout → verificar `localStorage` limpio (sin `liftgo:rq-cache:v1`).

**Changelog**: `v7.140.0` (minor, `improvement` + `perf`).

---

### Fase 5B — Requiere tu decisión (te la planteo aquí, la ejecuto en el siguiente sprint)

**MP-M1 · `.env` fuera del repo**
En este proyecto `.env` es autogenerado por Lovable Cloud (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`) y tengo prohibido tocarlo. Todos los valores son públicos por diseño. Recomendación: **descartar como falso positivo** y documentar en `README` que `.env` es managed.

**MP-M2 · Sentry**
Está el plugin de Vite subiendo sourcemaps pero nunca hay `Sentry.init()`. Dos caminos:
- **A) Activar**: necesito el DSN de Sentry para `main.tsx`, `ErrorBoundary` y `RouteErrorElement`; reemplazo `lib/telemetry.ts`.
- **B) Eliminar**: `bun remove @sentry/react @sentry/vite-plugin`, limpiar `vite.config.ts` y `lib/telemetry.ts`.

**MP-M4 · Coverage**
Subir thresholds de `vitest.config.ts` un escalón (ej. lines 20→30) requiere agregar tests reales en `auth`, `users` (`useSetPasswordForm`) y `returns` (`return_inspections`). Es un mini-sprint de ~1–2 h por módulo.

¿Ejecuto Fase 5A ahora y B queda para cuando decidas DSN/coverage?
