# LiftGo ERP

ERP interno para gestión de flotas de montacargas, CRM, reservas, facturación
CFDI 4.0, mantenimiento y portal de clientes. Localizado en español mexicano
(`es-MX`), timezone `America/Monterrey`, moneda predeterminada MXN.

## Stack

- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui.
- **Backend:** Lovable Cloud (Supabase gestionado) — Postgres con RLS, Edge
  Functions Deno, Storage, Auth y Vault.
- **Estado remoto:** TanStack Query v5 (persister en `localStorage`).
- **Testing:** Vitest para unit/integration; Playwright para E2E.
- **PDF:** jsPDF (lazy-loaded) — ver `mem://tech/security/vulnerabilities`.

## Cómo trabajar en este proyecto

Este repositorio se edita principalmente desde
[Lovable](https://lovable.dev). Los cambios hechos en Lovable se commitean
automáticamente y quedan disponibles en el editor local.

Para desarrollo local:

```bash
bun install
bun run dev            # levanta Vite en http://localhost:8080
bun run test           # unit tests (Vitest)
bun run test:e2e       # Playwright
```

El script `scripts/gen-version.mjs` corre automáticamente antes de `dev` y
`build`, generando `public/version.json` a partir del changelog para que la
UI muestre la versión sin descargar el changelog completo.

## Directorios clave

- `src/features/*` — módulos de negocio (bookings, invoices, crm, etc.).
- `src/components/*` — componentes UI reutilizables.
- `supabase/functions/*` — Edge Functions Deno.
- `supabase/migrations/*` — schema + RLS.
- `tests/e2e/*` — specs Playwright.
- `.lovable/plan.md` — plan activo (si aplica).

## Convenciones

- Fechas: `DD/MM/YYYY`, timezone `America/Monterrey` (usar `nowMty()`).
- Moneda: MXN por defecto (`formatCurrency` / `toMxn`).
- Cada cambio publicado agrega una entrada a `public/changelog.json` +
  `public/changelog/v{X.Y.Z}.json`.
- Consultar `mem://index.md` antes de introducir patrones nuevos —
  hay helpers canónicos (mutations, form dialogs, edge function shared).
