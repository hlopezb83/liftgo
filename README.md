# LiftGo ERP

ERP interno para gestión de flotas de montacargas, CRM, reservas, facturación
CFDI 4.0, mantenimiento y portal de clientes. Localizado en español mexicano
(`es-MX`), timezone `America/Monterrey`, moneda predeterminada MXN.

## Stack

- **Frontend:** React 19 + TanStack Start / TanStack Router (SSR, rutas por
  archivo) sobre Vite 8 + TypeScript 6 + Tailwind CSS v4 + shadcn/ui.
- **Backend:** Lovable Cloud (Supabase gestionado) — Postgres con RLS, Edge
  Functions Deno, Storage, Auth y Vault.
- **Lógica de servidor de la app:** server functions (`createServerFn`) en
  `src/lib/*.functions.ts`, ejecutadas en el Worker SSR.
- **Estado remoto:** TanStack Query v5 (persister en `localStorage`).
- **Testing:** Vitest 4 (happy-dom) para unit/integration; Playwright para E2E.
- **PDF:** `@react-pdf/renderer` (lazy-loaded) — ver `src/lib/pdf/`.
- **Build y despliegue:** build SSR con Nitro (preset `cloudflare-module`) hacia
  `dist/client` + `dist/server`; configuración de Worker en `wrangler.jsonc`.

## Requisitos

- Node `>=24` (ver `engines` en `package.json`, `.nvmrc`, `.node-version`).
- **Bun** como gestor de paquetes y runner de scripts.

## Cómo trabajar en este proyecto

Este repositorio se edita principalmente desde
[Lovable](https://lovable.dev). Los cambios hechos en Lovable se commitean
automáticamente y quedan disponibles en el editor local.

Para desarrollo local:

```bash
bun install
bun run dev            # servidor de desarrollo de Vite/TanStack Start
bun run build          # build SSR de producción (dist/client + dist/server)
bun run preview        # sirve el build con `wrangler dev --port 4173`
bun run typecheck      # tsc --noEmit
bun run lint           # ESLint
bun run test           # unit tests (Vitest)
bun run test:e2e       # Playwright (usa `bun run preview` en el puerto 4173)
bun run changelog:check  # valida el changelog
```

El script `scripts/gen-version.mjs` corre automáticamente antes de `dev` y
`build`, generando `public/version.json` a partir del changelog para que la
UI muestre la versión sin descargar el changelog completo.

## Directorios clave

- `src/routes/*` — rutas file-based de TanStack Router (`__root.tsx`, layouts
  `_main` y `_portal`). `src/routeTree.gen.ts` es generado: no editarlo.
- `src/app-routes/*` — constantes de URL y registro de rutas (loader lazy,
  módulo y nivel de permiso).
- `src/router.tsx`, `src/start.ts`, `src/server.ts` — router, middlewares
  (errores, CSRF, bearer de sesión) y entrada SSR del Worker.
- `src/features/*` — módulos de negocio (bookings, invoices, crm, etc.).
- `src/components/*` — componentes UI reutilizables.
- `src/lib/*.functions.ts` — server functions; `*.server.ts` y `src/lib/server/`
  son código exclusivo de servidor.
- `src/styles.css` — Tailwind v4 y tokens de diseño (no hay `tailwind.config.ts`).
- `supabase/functions/*` — Edge Functions Deno (CFDI, cron, storage).
- `supabase/migrations/*` y `drizzle/migrations/*` — schema + RLS.
- `tests/e2e/*` — specs Playwright (ver `tests/e2e/README.md`).
- `supabase/tests/*` — smokes SQL y suites de RLS (ver `supabase/tests/rls/README.md`).

## Documentación

Solo estos documentos se mantienen al día; todo lo demás (auditorías, planes,
reportes puntuales) vive en el historial de cambios:

- `architecture.md` — arquitectura, convenciones y reglas de negocio críticas.
- `docs/architecture-guardrails.md` — checks de capas que gatean el merge.
- `docs/paginacion-cursor.md` — patrón de listados y cuándo migrar a cursor.
- `CHANGELOG.md` + `public/changelog/` — historial funcional versión por versión.

## Convenciones

- Fechas: `DD/MM/YYYY`, timezone `America/Monterrey` (usar `nowMty()`).
- Moneda: MXN por defecto (`formatCurrency` / `toMxn`).
- Cada cambio publicado agrega una entrada a `public/changelog.json` +
  `public/changelog/v{X.Y.Z}.json`.
- Consultar `mem://index.md` antes de introducir patrones nuevos —
  hay helpers canónicos (mutations, form dialogs, edge function shared).

> Nota: la migración a multi-organización está **en curso**. El esquema ya
> incluye organizaciones y `organization_id` en las tablas operativas; esta
> revisión documental no certifica el cierre de la migración — cualquier
> pendiente debe confirmarse contra el código vigente. Ver §6.2 de
> `architecture.md`.
