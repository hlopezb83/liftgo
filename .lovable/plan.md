# Registro de las migraciones 0058–0061 antes del PR #98

## Respuesta corta

En este entorno no hay ningún mecanismo oficial que **registre** 0058–0061 sin volver a ejecutarlas. No hice ningún cambio: ni al código, ni a los datos, ni al registro de migraciones.

## Qué hay disponible y por qué no sirve

| Mecanismo | Qué hace en realidad | ¿Es seguro para este caso? |
|---|---|---|
| Herramienta de migraciones de Lovable | Crea un archivo **nuevo** y después corre el migrador de Drizzle sobre todo el journal | No |
| Consultas SQL del agente | Leen o escriben directamente en la base | No: escribir en el registro a mano está prohibido |
| `drizzle-kit migrate` local | No hay credenciales de producción, y la política lo prohíbe | No |

Detalle de la herramienta de migraciones: cuando corre el migrador, Drizzle **ejecuta** y registra en orden todas las entradas con `when` mayor que 1790874179000. Eso incluye 0058–0061 y además el archivo nuevo. Hay tres problemas:
1. **Vuelve a ejecutar** los efectos de 0059–0061, justo lo que se quiere evitar. Solo sería inofensivo si las cuatro migraciones son idempotentes, y eso no se ha comprobado con una prueba.
2. Crearía un archivo 0062 nuevo que choca con el 0062 del PR #98 (mismo índice, journal distinto).
3. Drizzle no tiene un modo "marcar como aplicada sin ejecutar".

## Canal de soporte

Soporte de Lovable, desde el editor: **menú de ayuda (?) → Contact support**. También sirve support@lovable.dev. Pide que lo escalen al equipo de Cloud/Database.

### Información para enviar

- Proyecto: LiftGo, publicado en `liftgo.lovable.app`.
- Commit de referencia en GitHub main: `7949cd813222d594c0e0462b110c1a1b7bad4448`.
- Estado del registro (`drizzle.__drizzle_migrations`): último `created_at` = 1790874179000, que corresponde a 0057. También existe el id 31, de origen desconocido: no se toca.
- Migraciones pendientes, con su tag y su `when` tal como aparecen en `drizzle/migrations/meta/_journal.json`:
  - 0058: solo agrega un comentario.
  - 0059: folios.
  - 0060: policy de profiles.
  - 0061: `handle_new_user`.
- Efectos de 0059–0061 ya verificados en la base con lecturas de solo lectura.
- Qué se pide (elegir una opción):
  - **A.** Registrar 0058–0061 en el registro con el hash (sha256) de cada archivo y su `when`, sin ejecutarlas.
  - **B.** Correr el migrador oficial sobre el journal actual, aceptando que se reejecuten. Solo si confirmamos antes que son idempotentes.
- Restricción: nada de 0062 hasta que el registro llegue a 0061.

## Siguientes pasos

1. Enviar la solicitud a soporte.
2. Mientras tanto, mantener el PR #98 en borrador. No aplicar 0062.
3. Cuando soporte confirme, hacer una lectura de solo lectura del registro: 4 filas nuevas con los hashes y `created_at` correctos, y `bun run migrations:check` OK.
4. Luego desplegar el PR #98 por el canal oficial. Su 0062 debe tener un `when` mayor que el de 0061.

Alternativa, si prefieres no esperar a soporte: aprobar la opción B después de comprobar la idempotencia de 0058–0061 con una prueba reversible (BEGIN/ROLLBACK). En ese caso, el 0062 del PR #98 sería la migración que dispara la aplicación en orden. Esto necesita tu autorización explícita.
