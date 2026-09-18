# Plan operativo: aplicar 0030 → 0035 por el canal oficial

## Herramienta oficial

El único canal disponible para aplicar migraciones a la base conectada es la herramienta de migración de Lovable (`lov_database--migration`). Ejecuta SQL de esquema sobre la base productiva con conexión privilegiada y registra la migración en el journal de Drizzle. No hay un comando de terminal autorizado (`drizzle-kit migrate`) contra producción, y el editor SQL queda excluido por tu instrucción.

Limitación importante: la herramienta recibe el SQL como texto y crea su propia entrada de migración. Para respetar "no crear ni alterar SQL", cada llamada usará el contenido byte-por-byte del archivo correspondiente, sin reformatear ni reordenar.

## Lote exacto y orden

Seis migraciones, una llamada por archivo, estrictamente en este orden:

1. `0030_multi_org_onboarding_and_customer_scope`
2. `0031_multi_org_audit_hardening`
3. `0032_multi_org_storage_staff_scope`
4. `0033_handle_new_user_trusted_org_context`
5. `0034_storage_manual_resolutions`
6. `0035_storage_manual_resolutions_force_rls`

Nada fuera de estos seis archivos. Sin Storage, sin segunda empresa, sin despliegues.

## Preflight de solo lectura (antes de la primera llamada)

1. Leer `drizzle.__drizzle_migrations` y confirmar que el último aplicado sigue siendo el baseline 0024–0029 (ids 25–30) y que el registro extra id31 continúa presente sin cambios.
2. Confirmar por hash que ninguna de las seis ya está aplicada.
3. Confirmar que el repositorio en HEAD contiene los seis archivos y las entradas de journal idx 30–35 con `when` estrictamente creciente.
4. Registrar la existencia de respaldo reciente (diario, retención aproximada de 14 días). No hay PITR manual ni restauración ensayada: eso se informa como riesgo aceptado, no como verificación.
5. Verificación previa local ya cubierta: la cadena completa 0000–0035 se aplicó en base efímera con 62/62 RLS y 45/45 smoke en verde.

## Verificación posterior (solo lecturas)

Después de cada migración: leer el journal y confirmar la nueva fila. Al final del lote:

- Confirmar RLS y FORCE en `storage_migration_manual_resolutions` y ausencia de grants a `anon`/`authenticated`.
- Confirmar helpers y policies creados por 0031–0033 (scope staff de Storage, contexto confiable de alta de usuario).
- Confirmar índices y funciones de 0030 (onboarding, clientes por organización).
- No se ejecuta ningún SQL de escritura adicional.

## Condiciones de parada

Se detiene el lote y se informa el punto exacto si: el estado del ledger difiere del preflight, una migración falla o se aplica parcialmente, la herramienta exige una aprobación no prevista, o el contenido aplicado no coincide con el archivo del repositorio.

## Después de aplicar

Actualizar `roadmap.md` y el changelog para reflejar que 0030–0035 quedaron aplicadas, y regenerar tipos si la herramienta no lo hace automáticamente. No se habilita el alta de la segunda empresa: sigue bloqueada por los 17 objetos históricos sin prefijo.
