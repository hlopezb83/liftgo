# Pendientes de la ronda 2 (R2)

Revisé los 34 bloques del documento (DB2-01 a DB2-21 y FE2-01 a FE2-13) contra el código y la base de datos. Casi todo quedó aplicado. Quedan **dos pendientes reales**.

## 1. Entregas históricas: la base rechaza lo que la pantalla permite (bug funcional)

El formulario de entregas ya tiene la casilla "Ya se realizó" que permite capturar una entrega con fecha pasada y la guarda como *completada*. Pero la validación de la base sigue rechazando cualquier fecha pasada, sin importar el estado.

Analogía: le pusimos una puerta nueva a la bodega, pero el guardia de adentro sigue con la lista vieja y no deja pasar a nadie con fecha de ayer.

Resultado hoy: si el usuario marca "Ya se realizó" y elige una fecha pasada, el formulario pasa la validación local y luego truena al guardar.

Corrección: ajustar la validación de la base para que la regla de "no en el pasado" aplique solo a entregas *programadas*, y permita registrar históricos cuando el estado sea *completada*. La regla de UPDATE aplicada en DB2-10 se conserva con la misma excepción.

## 2. Falta la entrada de changelog v7.260.0 en la app

`package.json`, `public/version.json` y `CHANGELOG.md` ya están en 7.260.0, pero el changelog que ve el usuario dentro de la app (índice + archivo de detalle de la versión) sigue en 7.259.1. Hay que agregar la entrada para que la novedad aparezca en pantalla.

## Todo lo demás ya está aplicado (verificado)

- Base de datos: DB2-01 a DB2-21 están vivos en el proyecto (guards de estados, metadatos fiscales, cotizaciones, daños, notas de crédito, pagos, contratos, entregas, último admin activo, dominio de cuentas de prueba).
- Frontend: avisos de truncamiento fuera del panel móvil de filtros, estados de error en portal/feedback/ayuda/changelog, validación inline de daños en devoluciones, CRM sin "Reabrir deal", advertencia al completar reserva sin inspección y captura histórica de entregas.
- Suite de pruebas: 1361 pruebas en verde y sin errores de tipos.

## Detalles técnicos

- Migración nueva sobre `public.validate_delivery_not_in_past()`: mantener el `RAISE` solo cuando `NEW.scheduled_date < CURRENT_DATE` **y** `COALESCE(NEW.status,'scheduled') <> 'completed'`. El trigger `trg_delivery_not_in_past` (INSERT + UPDATE OF scheduled_date) queda igual; conviene ampliarlo también a `UPDATE OF status` para que no se pueda regresar a *programada* una entrega con fecha pasada.
- Changelog: agregar objeto `7.260.0` al inicio de `public/changelog.json` (type `minor`, category `improvement`) y crear `public/changelog/v7.260.0.json` con el mismo formato que `v7.259.1.json`.
