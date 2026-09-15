# Corregir el setup RLS de Storage

## Alcance
- Ajustar únicamente `supabase/tests/rls/storage_org_prefix.sql`.
- Establecer un contexto local válido antes de crear las organizaciones ficticias y conservarlo durante todas las fixtures iniciales.
- Limpiar el contexto antes de cada sesión autenticada, sin modificar triggers, políticas ni la migración 0022.
- Mantener sin cambios las pruebas positivas y negativas de aislamiento entre organizaciones.

## Validación
- Revisar todos los inserts del setup para confirmar organización explícita o contexto inequívoco.
- Ejecutar migraciones desde cero, suite RLS completa y smoke SQL si el entorno efímero local está disponible.
- Si Docker o la herramienta local siguen ausentes, ejecutar validaciones estáticas puntuales y dejar la ejecución integral claramente pendiente de GitHub Actions.
- Registrar el patch requerido en changelog y regenerar los índices de versión.

## Restricciones
- Sin escrituras en producción, movimientos de archivos ni despliegues.
- Sin cambios a `enforce_organization_write_context`, RLS o la migración 0022.
