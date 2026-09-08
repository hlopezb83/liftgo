# Migrar las 7 funciones internas restantes a TanStack

Las funciones que quedan en el sistema anterior son 23. De ellas, 16 deben quedarse donde están (tareas programadas y todo el grupo fiscal CFDI, que comparte código con esas tareas, más 2 que dependen de librerías que solo existen en ese entorno). Las 7 restantes son internas: solo las llama tu propia app, así que pueden vivir dentro del proyecto.

## Qué se mueve

| Función | Qué hace | Quién la usa |
| --- | --- | --- |
| invite-user | Alta de usuario interno + rol | Gestión de Usuarios |
| delete-user | Baja de usuario | Gestión de Usuarios |
| reset-user-password | Enlace de recuperación de un solo uso | Gestión de Usuarios |
| toggle-user-status | Activar/desactivar cuenta | Gestión de Usuarios |
| invite-customer | Acceso al portal de clientes | Clientes |
| classify-feedback-report | Clasificación con IA de reportes | Feedback |
| validate-supplier-rep | Validación de REP de proveedor (XML) | Cuentas por pagar |

Se conservan tal cual: reglas de negocio, validaciones, roles permitidos, límites de intentos por minuto, mensajes en español y la forma exacta de la respuesta. No se toca la base de datos ni los permisos.

## Cómo se hace

1. **Utilidades compartidas.** Portar a `src/lib/server/` los ayudantes que estas 7 usan: verificación de rol (`requireAdmin` / `requireRole`), límite de intentos, respuestas JSON de error y validadores (`isEmail`, `isUUID`, rol válido). Se copian, no se rediseñan; el grupo fiscal sigue usando su copia actual intacta.
2. **Un archivo por función** en `src/lib/*.functions.ts` con `createServerFn` + `.middleware([requireSupabaseAuth])` + `.inputValidator(...)` con zod. El chequeo de rol se hace con `context.supabase.rpc('has_role', ...)` antes de cargar el cliente privilegiado dentro del handler; nunca se decide el rol con el cliente privilegiado.
3. **Los 7 puntos de llamada** en la app cambian de `supabase.functions.invoke("...")` a la llamada tipada, manteniendo el mismo objeto de entrada y de salida para que los componentes no cambien. Se ajusta o retira `invokeEdgeFunction` según quede sin uso.
4. **Pruebas.** Las 7 pruebas actuales (en Deno) se reescriben como pruebas del proyecto (vitest) cubriendo lo mismo: rechazo sin sesión, rechazo por rol insuficiente, validación de entrada, caso feliz y el caso "no puedes borrarte/desactivarte a ti mismo".
5. **Verificación:** typecheck, build y la suite completa en verde, más una prueba manual de cada acción en la vista previa.
6. **Limpieza diferida.** El código anterior se deja desplegado hasta que publiques y confirmes que todo funciona. Solo entonces se retiran esas 7 del sistema viejo, en un paso posterior que me pidas.

## Notas técnicas

- `validate-supplier-rep` lee archivos del almacenamiento y analiza XML con expresiones regulares (sin DOM): funciona igual en el nuevo entorno.
- `classify-feedback-report` seguirá usando la pasarela de IA con la misma llave del servidor.
- Los enlaces de invitación y recuperación se siguen generando con el cliente privilegiado, cargado dentro del handler para que nunca llegue al navegador.
- Cambio de versión: **minor** (v8.1.0) — mismo comportamiento, distinta plomería. Se agrega la entrada al changelog.

## Fuera de alcance

Tareas programadas, timbrado CFDI, notas de crédito, complementos de pago, cancelaciones, descargas, validación SAT, `generate-manual` y `parse-csf`: se quedan donde están.
