# Tareas programadas de CFDI (401) + Validación masiva de la cartera contra el SAT

## Parte 1 — Arreglar el 401 de las tareas programadas

Estado verificado hoy: las últimas 144 llamadas de las tareas programadas terminaron en `401 {"error":"Unauthorized"}`. Las tareas activas (`process-cfdi-retry-queue-5min`, `reconcile-stamping-invoices-5min`, `generate-recurring-invoices-daily`, `generate-recurring-maintenance-daily`) arman el encabezado con `public.internal_get_cron_secret()` (valor guardado en la bóveda de la base), mientras que las funciones comparan primero contra el secreto `CRON_SECRET` configurado en el backend. Ambos existen por separado y no coinciden, así que ninguna llamada pasa la autenticación.

Qué se hará:

1. Unificar el secreto en un solo valor y dejar la bóveda de la base como fuente de verdad, sin escribir nunca el valor en el repositorio.
2. Ajustar la autenticación compartida de las tareas programadas para que acepte tanto el secreto del entorno como el de la bóveda (comparación segura, sin filtrar cuál coincidió). Hoy solo usa el de la bóveda cuando el del entorno está vacío, que es exactamente el caso que falla.
3. Reagendar las tareas con una guarda: si el secreto no existe, la tarea no se programa y deja un aviso, en lugar de mandar un encabezado vacío cada 5 minutos.
4. Limpieza de tareas rotas o duplicadas detectadas:
   - `scan-overdue-invoices-daily` apunta a una función que ya no existe en el proyecto: se retira.
   - `generate-recurring-maintenance-monthly` duplica a `generate-recurring-maintenance-daily` con un encabezado antiguo fijo: se retira el duplicado.
5. Verificación: disparar manualmente una corrida y confirmar en la bitácora de llamadas que el código de respuesta pasa de 401 a 200.

## Parte 2 — Validación masiva de la cartera contra el SAT

Hoy la validación real contra la Constancia de Situación Fiscal (vía el PAC, sin consumir timbre) solo se puede lanzar desde el detalle de una factura. Se agregará una revisión de toda la cartera.

Qué se hará:

1. Guardar el resultado de la última validación en cada cliente: estado (válido / con diferencias / no validado / error), fecha de validación y el detalle de los campos que no coinciden.
2. Nueva función de backend `validate-customers-tax-info`, solo para Admin y Administrativo, que:
   - Toma los clientes activos con RFC (excluye el RFC de Público en General).
   - Los valida por lotes con pausas para no saturar al PAC, con tope por corrida y reanudación en la siguiente.
   - Guarda el resultado en cada cliente y devuelve el resumen.
3. Nueva vista en Clientes: "Validación fiscal SAT", con:
   - Botón para lanzar la revisión y barra de avance.
   - Resumen: cuántos válidos, cuántos con diferencias, cuántos sin validar.
   - Tabla de clientes con diferencias, señalando el campo exacto (RFC, razón social, régimen o código postal) y acceso directo a editar al cliente.
   - Exportación a CSV del listado de diferencias.
4. En el detalle de cada cliente se mostrará una insignia con el estado de la última validación y su fecha.

## Detalles técnicos

- Base de datos: nuevas columnas en `customers` (`sat_validation_status`, `sat_validated_at`, `sat_validation_errors` jsonb) sin exponerlas al portal del cliente; se reutilizan las políticas existentes de la tabla. Reagendado de `cron.job` dentro de una migración con guarda sobre el secreto.
- Backend: se extrae la llamada al validador del PAC a `_shared/` para que la usen tanto `validate-receptor-tax-info` como la nueva función masiva (sin cambiar el comportamiento actual del validador por factura). Ajuste en `_shared/cronAuth.ts` para aceptar entorno o bóveda.
- Frontend: nueva ruta bajo Clientes con permisos de Admin/Administrativo, hooks con React Query y las claves de caché de la feature de clientes.
- Pruebas: pruebas Deno de la autenticación de cron (entorno vs bóveda) y de la función masiva (paginación, saltos de Público en General, manejo de error del PAC); pruebas de UI del resumen y la tabla de diferencias.
- Sin cambios en reglas de negocio, RLS existentes, máquinas de estados ni lógica de timbrado.
- Al cierre: entrada nueva en el changelog (versión menor) y archivo de detalle correspondiente.
