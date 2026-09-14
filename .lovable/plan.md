# Desplegar Edge Function migrate-storage-org-prefix

## Objetivo
Desplegar en el backend conectado la Edge Function existente `migrate-storage-org-prefix` usando exactamente el código sincronizado desde Git (sin ediciones).

## Acciones
1. Verificar que `supabase/functions/migrate-storage-org-prefix/index.ts` existe y que no hay cambios locales pendientes que la modifiquen (no se edita nada).
2. Desplegar únicamente esa función con la herramienta de despliegue de funciones.
3. Confirmar el despliegue consultando logs/estado de la función.

## Fuera de alcance (explícito)
- No se cambia el esquema ni se ejecuta SQL.
- No se mueven objetos de Storage.
- No se habilita `STORAGE_MIGRATION_APPLY_ENABLED` (la función queda en modo dry-run/solo reporte).
- No se publica el frontend.
- No se crean ni editan archivos, no hay commits.

## Verificación
- La función responde tras el despliegue (invocación de prueba sin efectos o verificación de estado del despliegue).
- `supabase/config.toml` ya declara `[functions.migrate-storage-org-prefix]` con `verify_jwt = false`; no se toca.

## Riesgo
Bajo: es una función cron/service-role existente que, sin el secreto de "apply", solo reporta. El despliegue no altera datos.
