# Corrección puntual de la migración 0025

## Alcance
- Sustituir `min(uuid)` en `current_organization_id()` por una expresión PostgreSQL válida que devuelva el UUID sólo cuando exista exactamente una membresía.
- Mantener el comportamiento cerrado: cero o varias membresías devuelven `NULL`, sin elegir registros arbitrarios ni modificar políticas, permisos o modelo.
- Registrar un nuevo patch sobre 8.8.20 en el changelog Markdown/JSON y regenerar la versión con el mecanismo existente.

## Validación
- Ejecutar las comprobaciones puntuales locales del SQL y del changelog.
- Sincronizar el cambio para obtener un nuevo commit y esperar los checks de GitHub Actions.
- Exigir resultados verdes de RLS desde una base limpia, smoke SQL completo, Vitest, cobertura, calidad y secretos antes de cerrar el tramo.

## Restricciones
- No aplicar la migración ni escribir en producción.
- No relajar políticas, omitir la migración ni cambiar lógica fuera del fallo reportado.
