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
| G4 | No importar el cliente Supabase desde páginas o componentes de features, salvo Auth. |
| G5 | Cero imports profundos entre features; usar el barrel público `@/features/<feature>`. |

El script escanea los archivos actuales y falla si detecta una violación. La
allowlist de `src/lib/domain/` de `scripts/arch-check.sh` es la fuente de
verdad para G2.

## ESLint y CI

- ESLint se ejecuta con cero warnings permitidos en el job `quality`.
- `arch:check` y el typecheck también forman parte de CI. Ver
  [docs/ci.md](./ci.md) para la matriz vigente.
- `knip` está disponible como revisión local con `bun run knip`; no es un gate
  de CI.
- Algunos escaneos excluyen tests co-localizados según el patrón del script.

Comandos locales:

```bash
bun run lint --max-warnings=0
bun run typecheck
bun run arch:check
```

## Revisión de código sin uso con Knip

`knip.jsonc` usa el esquema de Knip 6 y reconoce las entradas de TanStack
Start, las funciones de Cloud, Playwright y los ejecutores de CI. El script
manual `scripts/cleanup-e2e.ts` también es una entrada: se conserva porque
forma parte del procedimiento de limpieza documentado en `docs/ci.md`.
El análisis no ejecuta esa limpieza ni llama a funciones de Cloud.

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

El análisis profundo conserva nueve observaciones justificadas:

- Los tres `default` de Vite y Playwright son contratos de sus ejecutores.
- `extractAttr`, `extractAllAttr` y `extractPagoNodes` siguen expuestos por el
  handler y la entrada de `validate-supplier-rep`: forman parte de la interfaz
  de compatibilidad del endpoint XML heredado. No se retira esa interfaz sólo
  por no tener imports actuales en el ERP.

No se añadieron exclusiones para ocultar estas exportaciones. El reporte
principal permanece en cero; el profundo es informativo y no cuenta estas
nueve observaciones como bugs de negocio pendientes.

## Cómo cambiar un guardrail

Cambia la regla y su escaneo
con alcance acotado, ajusta la allowlist sólo si la nueva ubicación está
justificada y refleja el comportamiento aquí. No rebajes un umbral para ocultar
deuda sin decisión arquitectónica y ruta de salida.
