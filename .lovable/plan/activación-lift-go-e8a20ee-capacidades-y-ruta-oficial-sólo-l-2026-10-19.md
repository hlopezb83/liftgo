# Activación Lift GO e8a20ee — capacidades y ruta oficial (sólo lectura)

Este documento es un diagnóstico. No se ha ejecutado nada. Las afirmaciones sobre el estado del repositorio o del ledger que no aparecen abajo siguen sin verificarse en este turno.

## Lo que puedo hacer desde Lovable

| Necesidad | Canal disponible | Garantías |
| --- | --- | --- |
| Aplicar 0105, 0106 y 0107 | Herramienta oficial de migraciones (`lov_database--migration`, Drizzle Kit) | Una migración por llamada; el SQL y la fila del ledger van en la misma transacción; las credenciales las pone la herramienta y nunca se muestran |
| Desplegar `stamp-payment-complement` y `generate-recurring-invoices` | `supabase--deploy_edge_functions` | Despliega el código del checkout actual del proyecto; no tiene versión fijada a un SHA ni canary |
| Comprobaciones previas y posteriores | `supabase--read_query`, logs de funciones y de base de datos | Sólo lectura |
| Frontend | Publicar desde Lovable, sólo con aprobación explícita | Atómico para el hosting |

## Lo que no puedo hacer o no está garantizado

1. **Ejecutar el runner del repositorio** (`drizzle-kit migrate` / `scripts/*` contra producción). No tengo una cadena de conexión privilegiada y las variables de base de datos del sandbox no sirven para eso. La única ruta oficial es la herramienta, que aplica **el SQL que se le entrega, uno a la vez**. No valida el prefijo del journal del repositorio contra el ledger.
2. **Ejecución exclusiva.** No existe un lock de mantenimiento ni un modo "sólo mi sesión". Lo más cercano es un `pg_advisory_xact_lock` o `LOCK TABLE` dentro del propio SQL revisado, y eso requiere que viva en las migraciones aprobadas.
3. **Detener o drenar escritores en curso.** No puedo pausar invocaciones en vuelo ni el tráfico de funciones. Las opciones reales son:
   - Cron (`generate-recurring-invoices`): `cron.unschedule` / `cron.alter_job(active := false)`. Es una escritura en la base de datos y necesita aprobación expresa.
   - REP (`stamp-payment-complement`): no tiene interruptor. Opciones: una bandera de mantenimiento ya presente en el código revisado (sin verificar), o una ventana coordinada por una persona sin usuarios timbrando. Después se leen `pg_stat_activity` y los logs para confirmar que no quedan escrituras activas.
   - Pausar todo el backend (`supabase--pause`) detiene todo el servicio. No se recomienda.
4. **Fijar un SHA.** El despliegue de funciones y las migraciones se toman del checkout del proyecto. El coordinador debe seleccionar la rama o commit `e8a20ee` antes de cualquier ejecución.

## Ledger: 106 filas frente a 105 esperadas

- No reescribir, borrar ni insertar filas. La herramienta oficial sólo agrega filas.
- Diferencias conocidas por el historial de esta sesión: la fila de 0104 tiene un hash distinto al autorizado porque se envió un espacio adicional. Su lógica es equivalente y la reconciliación quedó pendiente de aprobación. Las 10 diferencias históricas y la fila retirada documentada deben compararse contra el manifiesto del PR287.
- Ruta oficial propuesta:
  1. Producir un manifiesto de excepciones aceptadas, revisado y versionado en el repositorio (idx, tag, hash del ledger, hash del archivo, motivo). Debe incluir 0104 y la fila retirada.
  2. Que el guard de prefijo del repositorio acepte **sólo** ese manifiesto exacto y siga fallando ante cualquier otra diferencia. Es un cambio de código en un PR con CI, no en la base de datos.
  3. Volver a ejecutar el preflight de sólo lectura. Sólo con resultado PASS se aplica 0105 → 0106 → 0107.
- Alternativa: aceptar formalmente que el guard se valide fuera de Lovable, por una persona con acceso al runner, y usar Lovable sólo para aplicar.

## Secuencia propuesta (cada paso con aprobación separada)

```text
0. Coordinador selecciona e8a20ee en el proyecto
1. Preflight de sólo lectura: ledger, manifiesto, objetos de 0105-0107, jobs de cron, conexiones activas
2. Ventana: desactivar el cron recurrente y congelar el REP (decisión humana)
3. Confirmar el drenado (pg_stat_activity y logs sin escrituras)
4. Aplicar 0105, verificar; 0106, verificar; 0107, verificar (bytes y SHA256 exactos, sin editar)
5. Desplegar las 2 funciones y leer sus logs
6. Reactivar el cron y el REP
7. Publicar el frontend (aprobación aparte)
```

Si un paso falla, se detiene todo sin aplicar migraciones parciales. Una migración que falla se revierte sola por la herramienta.

## Lo que necesito de ustedes

- La decisión sobre el manifiesto de excepciones (ruta A) o la validación externa (ruta B).
- El SHA256 autorizado de 0105, 0106 y 0107.
- Aprobación para desactivar y reactivar el cron, y el mecanismo para congelar el REP.
- La selección de `e8a20ee` en el proyecto.
