# Plan: corregir los errores reales de LiftGO en Sentry

Quedan 5 errores abiertos. Revisé cada uno: 3 probablemente ya están corregidos (solo hay que confirmarlo), 1 es un problema real que hay que revisar a fondo y 1 es la conexión a internet del usuario.

Los errores de la otra app (embarques, CRM, costeo) quedan fuera de este plan.

## 1. Confirmar y cerrar los que ya parecen corregidos

| Error | Qué pasó | Por qué creo que ya está corregido |
|---|---|---|
| LIFTGO-E | Al crear una reserva se mandó un rango de fechas inválido al buscar equipos disponibles (versión 8.44.13) | Desde la 8.44.33 la app revisa las fechas antes de buscar y muestra el aviso en la misma pantalla |
| LIFTGO-F | Un despachador abrió el Estado de resultados y el sistema lo bloqueó (versión 8.44.15) | Después se cerró el acceso financiero del despachador en el menú, la página y la base de datos |
| LIFTGO-D | Una sesión vencida en una cotización se reportó como error (versión 8.44.5) | Desde la 8.44.6 "token inválido" se trata como sesión vencida y te manda a iniciar sesión |

Para cada uno: agregar o revisar una prueba que repita el caso. Si pasa, lo marco como resuelto en Sentry con una nota. Si falla, lo corrijo antes de cerrarlo.

## 2. Revisar a fondo: permisos en Facturas de proveedor (LIFTGO-A)

Un usuario administrativo hizo un cambio en Facturas de proveedor y la base de datos lo rechazó por falta de permiso (versión 8.44.4).

Lo que encontré:
- La base de datos deja editar casi toda la factura, pero protege a propósito los campos de aprobación, descuento y empresa. Esos solo se cambian por los caminos seguros del sistema.
- Algunas acciones (registrar, eliminar, cancelar) todavía escriben directo en la tabla. Las que revisé solo tocan campos permitidos, pero falta confirmar todas.

Pasos:
1. Revisar cada botón que guarda algo en Facturas de proveedor y confirmar que ninguno escribe directo en un campo protegido.
2. Si alguno lo hace, cambiarlo al camino seguro que ya existe, sin tocar permisos ni la base de datos.
3. Agregar una prueba que falle si una acción vuelve a escribir un campo protegido.
4. Marcar LIFTGO-A como resuelto.

Si para corregirlo hace falta cambiar permisos de la base de datos, me detengo y te pregunto antes.

## 3. Fallo de internet al entrar al portal (LIFTGO-B)

Un cliente intentó entrar al portal sin conexión. No es un error de la app.

Propuesta:
- Si el navegador dice que no hay internet, mostrar "Sin conexión, revisa tu internet" y no mandar nada a Sentry.
- Si sí hay internet y aun así falla, seguir reportándolo, porque podría ser una caída real del inicio de sesión.

## 4. Cierre

- Pruebas solo de lo que se toca, más revisión de código y de tipos. Las pruebas completas siguen en GitHub.
- Historial de cambios: versión 8.44.35 (corrección menor).
- Resumen breve con analogías y la lista de errores que quedaron cerrados en Sentry.

## Detalles técnicos

- E: prueba de `/bookings/new` con rango inválido; confirmar que no se llama a la función de disponibilidad (código `22023`).
- F: confirmar que `RoleGuard financial` y la resolución efectiva de dispatcher bloquean `/income-statement`; esto se corrigió con las migraciones 0111/0112.
- D: `src/lib/auth/sessionExpiry.ts` ya reconoce `Unauthorized: Invalid token`. Confirmar que esa ruta también evita `captureOperationalError` cuando el error de consulta llega con `errorCode` UNKNOWN.
- A: `supplier_bills` no da a `authenticated` permiso de UPDATE en `approval_status`, `approved_by`, `approved_at`, `approval_notes`, `discount`, `rejected_by`, `rejected_at`, `organization_id`, `id` ni `created_at`. Revisar `useSupplierBillMutations`, `BillApprovalSection`, lotes de pago y conciliación. Agregar una prueba estática de las columnas que envía cada `.update()`/`.insert()` directo.
- B: en el flujo de inicio de sesión del portal, `AuthRetryableFetchError` con estado 0 y `navigator.onLine === false` se trata como aviso local y no se reporta.
- No se cambian base de datos, permisos, funciones del servidor ni operaciones fiscales.
