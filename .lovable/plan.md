## Causa

El toast viene de `useChangelog` cuando `fetchChangelogIndex()` falla. La validación de `parseIndexEntry` usa el regex `SEMVER = /^\d+\.\d+\.\d+$/`, que **rechaza versiones pre-release** como `6.5.0-alpha.1` y `6.5.0-alpha.2` (introducidas en los turnos previos del refactor DataTable v2).

Al encontrar la primera entrada inválida, el parser lanza, React Query marca error → se dispara el toast en cada pantalla que monta `useChangelog` (incluido el botón de versión global), por eso aparece al navegar a `/contracts`.

## Fix propuesto

Soportar pre-release semver en el changelog, sin retirar las entradas alpha (queremos trazabilidad del refactor en curso).

1. **`src/features/changelog/lib/changelog.ts`**
   - Cambiar `SEMVER` a `/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/`.
   - Ajustar `compareSemver` para extraer solo el `major.minor.patch` numérico y, ante empate, ordenar pre-release **antes** de la versión estable (`-alpha` < final), siguiendo la semántica de semver.org. Sin `as`, sin `!`.
   - `fetchChangelogDetail` y el path `/changelog/v${version}.json` siguen funcionando porque ya existen los archivos `v6.5.0-alpha.1.json` y `v6.5.0-alpha.2.json`.

2. **Verificación**
   - Recargar `/contracts` y confirmar que el toast desaparece.
   - Abrir el modal de changelog y verificar que las entradas alpha aparecen ordenadas correctamente al inicio.

3. **Changelog**
   - Nueva entrada `patch` `6.5.1` (o `6.5.0-alpha.3` si prefieres mantener la línea alpha): "Fix: changelog soporta versiones pre-release (-alpha/-beta)".

## Fuera de alcance

- No tocar `DataTableV2`, `useLiftgoTable` ni el piloto de PortalContracts.
- No reescribir el sistema de versionado ni migrar a una librería semver externa (overkill para el caso).

## Pregunta rápida

¿Prefieres que la nueva entrada del changelog sea `6.5.1` (patch estable) o `6.5.0-alpha.3` (sigue en la línea alpha del refactor)?
