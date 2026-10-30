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

Desarrollo y CI usan Node.js **26.13.0 LTS** y Bun **1.4.4**. Los pines están en
`.node-version`, `.nvmrc`, `.bun-version` y `package.json`; CI usa esas mismas
versiones. Instala los runtimes oficiales o selecciónalos con tu gestor local
de versiones y comprueba `node --version` y `bun --version` antes de instalar.

```bash
bun install --frozen-lockfile
bun run dev
```

La raíz usa exclusivamente `bun.lock`: no ejecutar `npm install` ni generar
`package-lock.json`. Para cambiar dependencias, actualiza intencionalmente el
manifiesto y el lock con Bun 1.4.4 y revisa el diff; las instalaciones normales
y CI deben conservar el hash del lock. `@types/node` se fija en **26.6.6**,
alineado con Node 26 y los peers de Vite/Vitest; TypeScript sigue en 6.0.3.
CI registra la versión efectiva y ejecuta prebuild, Vite y Vitest con Node
explícitamente. Bun sigue siendo el gestor de dependencias.

El preview de Lovable observado el 30-oct-2026 usa Node **22.23.4** e ignora
los pins del repositorio; el runtime del build de publicación no es observable.
`engines.node` admite `^22.23.4 || ^24.22.1 || ^26.13.0` para conservar ese
preview, mientras desarrollo/CI seleccionan 26.13.0. No se introducen APIs
exclusivas de Node 26: la migración del host sigue sin verificar. El SSR
desplegado es un Worker de Cloudflare, no un proceso Node 26; las funciones
Edge conservan Deno **2.9.8**.

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
