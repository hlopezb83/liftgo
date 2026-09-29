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

## Cómo cambiar un guardrail

Cambia la regla y su escaneo
con alcance acotado, ajusta la allowlist sólo si la nueva ubicación está
justificada y refleja el comportamiento aquí. No rebajes un umbral para ocultar
deuda sin decisión arquitectónica y ruta de salida.
