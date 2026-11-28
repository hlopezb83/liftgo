# Guardrails de arquitectura — LiftGo

Reglas documentadas a partir de `scripts/arch-check.sh`, ESLint y
`.github/workflows/ci.yml`. Si una regla cambia, actualiza el script o la
configuración y este documento en el mismo cambio.

## Límites de las capas

- Las páginas y componentes de una feature no consultan directamente el cliente
  Supabase. La excepción es `src/features/auth/pages/AuthPage.tsx` para el
  inicio de sesión antes de tener sesión.
- Las lecturas y escrituras de negocio viven en hooks o funciones de servidor;
  la UI compone y presenta resultados.
- Las features consumen la API pública de otra feature desde
  `@/features/<feature>`, no desde rutas internas.
- La lógica nueva nace en su feature dueña. `src/lib/domain/` está congelado
  por allowlist.

## Checks bloqueantes de `arch:check`

| Regla | Verificación |
| --- | --- |
| G1 | No crear `src/features/*/api/`; la I/O de feature se organiza en `hooks/`. |
| G2 | `src/lib/domain/` sólo puede contener archivos permitidos por el script. |
| G3 | No crear `src/api/` en la raíz de `src/`. |
| G4 | No importar el cliente Supabase desde páginas o componentes de features ni desde `src/components/**`, salvo `AuthPage.tsx`. |
| G5 | Cero imports profundos entre features (incluyendo desde `layouts`, `contexts`, `components` y `hooks`); usar el barrel público `@/features/<feature>`. Las capas compartidas (`src/lib/**` y `src/integrations/**`) no dependen de `src/features/**`. Las tablas de rutas (`src/routes/**`, `src/app-routes/**`) sólo pueden referenciar `pages/*` para *code-splitting* por ruta. |

G4/G5 usan el AST de TypeScript (`scripts/check-feature-imports.mjs`) sobre todo `src/`. Detectan import/export-from, import de tipos y cargas dinámicas/require con specifier literal, tanto `@/` como rutas relativas normalizadas. Sólo el barrel raíz (`<feature>` o `<feature>/index`) se permite entre features; los imports dentro de la misma feature usan rutas relativas. Las únicas excepciones del escaneo son archivos de tests/fixtures, archivos generados (`types.ts`, `routeTree.gen.ts`), el bootstrap temprano `src/instrument-client.ts` para `recoverySession` y, para G4, `src/features/auth/pages/AuthPage.tsx`. Los specifiers computados en ejecución no se resuelven. Sus fixtures negativas y excepciones corren en el job `quality`.


El script escanea los archivos actuales y falla si detecta una violación. La allowlist de `src/lib/domain/` de `scripts/arch-check.sh` es la fuente de verdad para G2.

## ESLint, TypeScript y CI

- ESLint se ejecuta con cero warnings permitidos (`--max-warnings=0`) en el job `quality`, incluyendo bloques dedicados para `src/components/ui/**` (seguridad, accesibilidad e íconos) y `supabase/functions/**/*.ts` (`max-lines: 300`, `max-lines-per-function: 150`, `complexity: 15`, tipado sin `any` ni `!`).
- `tsconfig.json` exige `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` y `noFallthroughCasesInSwitch: true`.
- `arch:check` y el typecheck también forman parte de CI. Ver [docs/ci.md](./ci.md) para la matriz vigente.
- `knip` se mantiene en verde (`bun run knip` código `0`, sin efectos laterales sobre `public/version.json`).

Comandos locales:

```bash
bun run lint --max-warnings=0
bun run typecheck
bun run arch:check
bun run knip
```

## Revisión de código sin uso con Knip

`knip.jsonc` usa el esquema de Knip 6 y reconoce las entradas de TanStack
Start, las funciones de Cloud, Playwright y los ejecutores de CI. También
registra la limpieza manual de E2E y las verificaciones locales que se lanzan
desde la terminal o se pasan como argumentos a un subproceso.

- `bun run knip` revisa archivos, dependencias, exportaciones y tipos.
- `bun run knip:deep` incluye además las exportaciones de las entradas;
  sus resultados requieren verificar los contratos del framework y de los
  ejecutores antes de retirar una exportación.
- Los componentes base de UI, los helpers compartidos de Cloud y los tipos
  generados conservan las exclusiones explícitas de la configuración.
- `drizzle-orm` se conserva: `drizzle-kit migrate` lo carga internamente en
  las pruebas RLS y A/B, aunque el esquema declarativo esté vacío.
- `@tanstack/start-storage-context` es una dependencia directa de desarrollo
  para la prueba del transporte real de funciones de servidor. Su versión
  debe coincidir con la que usan los paquetes de Start en el lockfile.

Cuando un símbolo sólo se usa en su archivo, debe ser interno. Las APIs entre
features siguen expuestas mediante sus barrels públicos. Verifica los imports,
las cargas dinámicas y las pruebas antes de eliminar código sin consumidores.

### Exportaciones de entradas revisadas

La revisión del 5 de octubre de 2026 retiró las constantes `FACTURAPI_BASE`
que quedaron sin uso al adoptar el cliente compartido del SDK. También hizo
internos los límites de ejecución, el catálogo de módulos y los tipos que
sólo usan sus propios handlers. Los cuerpos de las funciones no cambian.

La revisión documentó los siguientes contratos de ejecución y compatibilidad.

- Los tres `default` de Vite y Playwright son contratos de sus ejecutores.
- `extractAttr`, `extractAllAttr` y `extractPagoNodes` siguen expuestos por el
  handler y la entrada de `validate-supplier-rep`: forman parte de la interfaz
  de compatibilidad del endpoint XML heredado. No se retira esa interfaz sólo
  por no tener imports actuales en el ERP.

## Cómo cambiar un guardrail

Cambia la regla y su escaneo
con alcance acotado, ajusta la allowlist sólo si la nueva ubicación está
justificada y refleja el comportamiento aquí. No rebajes un umbral para ocultar
deuda sin decisión arquitectónica y ruta de salida.
