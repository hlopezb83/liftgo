# Preflight solo-lectura: backups/PITR y canal oficial de migraciones Drizzle

## Alcance

Solo lectura. No se crean/editan archivos de código, no se ejecutan pruebas, migraciones, DDL, cambios de ACL, Storage ni deploys.

## Hallazgo 1 — Backup/PITR y restauración ensayada

Evidencia: documentación oficial de Lovable (consultada vía búsqueda de docs esta sesión).

- **Backups diarios:** Lovable toma backups diarios de la base, retenidos ~14 días, accesibles en **More → Cloud → Database → Backups**, donde se puede iniciar una restauración.
- **PITR:** No existe PITR manual desde la consola; solo restauración desde un backup diario existente.
- **Restauración ensayada:** No hay forma de verificar desde Lovable si se hizo una restauración de prueba reciente, ni de ensayar una sin ejecutar un restore real. No hay historial de restores consultable que yo pueda leer desde las herramientas del agente.
- **Exportación:** Cloud → Overview → Advanced settings → Export project data (schema + registros; excluye Storage y Edge Functions). Es exportación, no verificación de backup.

**Conclusión:** NO puedo verificar backup/PITR ni una restauración ensayada reciente desde las capacidades del agente. Lo único comprobable manualmente por el usuario es la existencia de backups diarios en Cloud → Database → Backups. La verificación de restore readiness queda como condición de paro antes del rollout de 0024–0029.

## Hallazgo 2 — Canal oficial de migraciones Drizzle

Evidencia: esquema de la herramienta de migración integrada (lov_database--migration).

- El canal oficial es la **herramienta de migración de Lovable Cloud** (`lov_database--migration`): recibe SQL DDL completo y autocontenido, crea una migración custom con drizzle-kit en `drizzle/migrations/`, verifica el set con `drizzle-kit check` y la aplica con el **migrador Drizzle normal** sobre una conexión privilegiada. Drizzle Kit es dueño del journal y snapshots.
- **Orden 0024–0029:** sí puede ejecutarlas en orden, pero una sola llamada crea y aplica UNA migración (una nueva entrada en el journal, siguiente a 0028/0029). Aplicar "las pendientes juntas" no es una operación de la herramienta: cada entrada pendiente (0024–0028 ya existen en repo, 0029 creada en el tramo anterior) se aplicaría en orden de `created_at` cuando el migrador corra contra producción. La herramienta aplica SQL nuevo; para las ya existentes en repo, la aplicación a producción ocurre por el flujo de migraciones de la plataforma, no por `bunx drizzle-kit migrate` manual (eso solo existe en CI con Supabase efímero).
- **Restricciones del canal:** solo DDL aditivo; no seeding, no DROP, no breaking changes; SQL destructivo pausa para aprobación del usuario.

## Condición de paro (sin cambios)

Antes de aplicar 0024–0029 a producción: el usuario debe confirmar manualmente en Cloud → Database → Backups que existe un backup diario reciente, y aceptar que no hay restore ensayado verificable desde Lovable. Sin esa confirmación, el rollout se detiene.

## Evidencia viva vs. inferencia

- Vivo (esta sesión): respuesta de la documentación oficial sobre backups/restore/export.
- Vivo (pre-flight previo): producción en 0023 (journal 24 filas), 0024–0028 pendientes.
- Inferencia documentada: el orden de aplicación por `created_at` del journal Drizzle.
