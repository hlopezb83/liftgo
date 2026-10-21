# MEJ-004 · Borradores locales de reserva

## Alcance

La pantalla Nueva reserva conserva una captura mínima en este navegador durante
un máximo de siete días desde su creación. No existe un borrador en la base de
datos, no se aparta equipo y no se activa una reserva al guardar o restaurar.
Crear reserva sigue siendo una acción explícita con la RPC transaccional vigente.
No se agregan tablas, permisos, migraciones, dependencias ni llamadas de escritura
al backend para el autoguardado.

## Datos y aislamiento

Se persisten exclusivamente IDs de equipo y cliente, fechas civiles de inicio y
fin y la opción de recurrencia. No se guardan nombres libres, contactos, catálogos,
credenciales, tokens ni otros campos. La pantalla declara esta limitación antes de
capturar y al salir; la guardia también detecta cambios en los campos no persistidos.

El espacio local depende del usuario, empresa y tipo de miembro verificados. La
carga transitoria de identidad no borra el borrador. Logout revoca también en memoria aunque el almacenamiento esté bloqueado.
Logout explícito o una identidad
verificada diferente rota el epoch y purga los borradores anteriores. No se leen
borradores antes de resolver la identidad. Este aislamiento funcional no cifra
localStorage ni protege frente a scripts maliciosos con acceso al mismo origen.

## Ciclo de vida

- Autoguardado inmediato de la captura mínima, sin temporizadores de escritura.
- Al volver se pide Restaurar o Descartar; no se mezcla un borrador con otra captura.
- Vencimiento absoluto creado + 7 días; editar o restaurar no amplía el plazo.
- Fechas serializadas como YYYY-MM-DD y rehidratadas como días civiles locales.
- Vencimiento comprobado al leer/escribir/enviar, al recuperar foco/visibilidad y
  por temporizador si la pestaña permanece abierta. Al resolver la identidad se
  depuran entradas vencidas; un navegador cerrado no ejecuta temporizadores ni
  puede borrar bytes hasta que vuelva a abrirse. Un reloj retrasado invalida
  marcas de tiempo futuras en lugar de prolongarlas.
- Revisiones detectan cambios en otras pestañas. Tombstones impiden que un borrador
  creado/descartado vuelva a leerse aunque una pestaña tardía reescriba bytes viejos.
- Un conflicto conserva la captura visible, bloquea autosave/envío y ofrece revisar
  explícitamente el borrador actual; no pisa la revisión de la otra pestaña.
- El éxito de creación captura el identificador del borrador antes de la solicitud:
  lo invalida aunque el componente ya se haya desmontado. No borra un borrador nuevo
  e independiente. El fallo de la RPC conserva la captura para reintentar.
- La falta de almacenamiento/cuota muestra un aviso y permite captura manual.
  La eliminación intenta revocación y borrado por separado. Si el navegador impide
  ambas, se informa del fallo de limpieza; no se promete persistencia o borrado
  duradero cuando el navegador lo rechaza. Borrar datos del sitio elimina los
  borradores; no se sincronizan entre navegadores/dispositivos.

## Validación al crear

Antes de invocar la RPC se reconsulta disponibilidad y la relación activa del
cliente en la empresa actual (sin confiar en un listado truncado o una caché vieja).
Una referencia archivada/invisible, error de lectura, equipo no disponible, cambio
de identidad o revisión conflictiva bloquea el envío. La RPC existente mantiene la
validación autoritativa de referencias, permisos y solapamientos bajo bloqueo de
fila; el preflight no sustituye esa protección. Un guard síncrono impide doble click
mientras se valida o se crea. La recurrencia vuelve a comprobar el mes calendario.

## Comprobaciones

Pruebas focales offline: serialización, PII excluida, campos parciales, datos corruptos,
versiones, fechas inválidas, caducidad exacta, reloj retrasado, restauración manual,
descartado, quota/denial, logout, cambio de usuario/empresa, loading transitorio,
revisiones y éxito entre pestañas, desmontaje/respuesta tardía, referencias frescas,
cliente archivado, disponibilidad fallida, RPC rechazada y doble envío.

Las pruebas de integración existentes de caché de identidad y guardias de navegación
se ejecutan junto a estas pruebas. No se ejecutaron migraciones ni se consultó una
base real. Build, tipado global, E2E visual y comprobación final de la rama integrada
quedan a cargo de la integración coordinada de las mejoras.

Resultado focal sobre esta implementación: 82 pruebas, 10 archivos, todo verde
(Vitest, un worker). ESLint de los archivos modificados/nuevos con
--max-warnings=0, arch:check y git diff --check también pasan. No equivale al
resultado de la suite completa, build o typecheck global.
