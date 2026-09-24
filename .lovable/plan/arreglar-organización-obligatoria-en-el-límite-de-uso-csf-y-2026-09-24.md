# Arreglar "organización obligatoria" en el límite de uso (CSF) y al borrar usuarios

## Problema confirmado
Ahora hay 2 empresas activas. Por eso la base de datos rechaza escribir sin una empresa explícita:
- **Leer CSF (`parse-csf`) responde 503.** El control de límite de uso (`check_and_record_rate_limit`) guarda cada intento en `rate_limits` sin indicar la empresa, y esa escritura se rechaza. Afecta a todas las funciones que comparten ese control.
- **Borrar un usuario devuelve 500.** Al eliminar la cuenta, se borran en cascada su perfil, su rol y su bitácora, y ese borrado corre sin empresa asignada. La parte de *crear* usuarios ya se corrigió en 8.42.4.

## Cambios propuestos
1. **Migración de límite de uso.** `rate_limits` es un contador técnico, no un dato de ninguna empresa. Se excluye de la guarda de empresa, o se registra con la organización del usuario cuando exista. Se mantiene el bloqueo seguro ante fallas (fail-closed).
2. **Nueva RPC `discard_internal_user`, sólo para el servidor.** Valida que quien borra sea admin de la empresa del usuario. Fija la empresa dentro de la misma operación y borra primero membresía, rol y perfil. Después, `deleteUserFn` borra la cuenta.
3. **Validación.** Prueba reversible (BEGIN/ROLLBACK) con 2 empresas, pruebas puntuales, changelog y despliegue sólo de `parse-csf` si hace falta.

## Detalle técnico
- Antes de escribir la migración, confirmar qué objeto exige `organization_id` en `rate_limits`: un DEFAULT, una política o el trigger de guarda.
- La migración debe crearse con `when` mayor que 1790874184000.
- Antes, coordinar el número con el PR #98.
