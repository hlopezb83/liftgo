# LiftGo ERP

ERP para operar renta y venta de montacargas: CRM, clientes, cotizaciones,
reservas, contratos, flota, entregas, devoluciones, mantenimiento, refacciones y
facturación CFDI 4.0. La interfaz usa español mexicano, zona horaria
`America/Monterrey` y MXN como moneda predeterminada.

## Stack

- React y TanStack Start/Router con Vite, TypeScript y Tailwind CSS.
- Lovable Cloud para Postgres, Auth, RLS, Storage y Edge Functions (Deno).
- Server functions de TanStack Start en `src/lib/*.functions.ts`.
- TanStack Query para estado remoto.
- Vitest para pruebas unitarias e integración; Playwright para E2E.
- PDFs con `@react-pdf/renderer`; SSR como Worker mediante Nitro y Wrangler.

Consulta las versiones y scripts exactos en `package.json`.

## Requisitos y comandos

Se requiere Node.js 24 o posterior y Bun.

```bash
bun install
bun run dev
```

Comprobaciones habituales:

```bash
bun run lint --max-warnings=0
bun run typecheck
bun run arch:check
bun run test
bun run build
bun run migrations:check
```

E2E requiere cuentas de prueba y un backend aislado. Lee
[tests/e2e/README.md](tests/e2e/README.md) antes de ejecutarlo. Las pruebas A/B
de empresa y las pruebas SQL de RLS usan una base local efímera; consulta
[docs/README.md](docs/README.md).

## Áreas principales

- `src/features/`: módulos organizados por dominio.
- `src/lib/`: funciones de servidor y utilidades compartidas.
- `src/routes/`: rutas file-based de TanStack Router.
- `drizzle/migrations/`: migraciones nuevas de esquema y RLS.
- `supabase/migrations/`: historial SQL legado que CI reaplica.
- `supabase/functions/`: Edge Functions Deno versionadas.
- `tests/e2e/`, `tests/multi-tenant-ab/` y `supabase/tests/rls/`: suites de prueba.

## Multiempresa

El código implementa alcance por organización y permisos de membresía; el logo
LiftGo es común a todas las organizaciones. La presencia de ese código no
demuestra el estado actual de Lovable Cloud, el ledger de migraciones, las
membresías, Storage, llaves fiscales ni la recuperación de respaldos. Consulta
el [estado multiempresa](docs/multiempresa/onboarding.md) y la
[política de migraciones](docs/migrations.md) antes de concluir que un
entorno está listo.

## Convenciones

- Fechas: `DD/MM/YYYY`; usa las funciones de fecha con zona de Monterrey.
- MXN es la divisa predeterminada; no sumes importes de distintas monedas.
- Los cambios publicados actualizan `public/changelog.json` y el detalle de
  versión correspondiente en `public/changelog/`; `CHANGELOG.md` mantiene el
  resumen para GitHub.
- Consulta [docs/README.md](docs/README.md) para encontrar guías vigentes.
