# Arreglo: "permission denied for function next_supplier_bill_number"

## Qué pasó

En el endurecimiento de seguridad de la v7.294.0 se quitó el permiso de ejecución a los usuarios normales sobre las funciones internas que generan folios (CXP-0001, COT-…, etc.), dejándolas solo para procesos internos.

El problema: dos caminos de la app las siguen necesitando desde la sesión del usuario, y ahora fallan con "permiso denegado":

1. **Llamadas directas desde la app** (verificado en el código): folio de factura de proveedor, folio de contrato y folio de cotización.
2. **Automatismos al guardar** (verificado en la base): al insertar una factura de proveedor, una entrega o una inspección de devolución, un automatismo pide el folio "en nombre" del usuario y hereda su falta de permiso.

Analogía: le quitamos al empleado la llave del cuarto de folios, pero su trabajo diario sigue exigiendo entrar ahí. La solución no es devolverle la llave maestra, sino poner una ventanilla que le entregue el folio solo si acredita que es personal autorizado.

## Alcance del arreglo

Una sola migración de base de datos:

1. **Automatismos de folio** (`set_supplier_bill_number`, `set_delivery_number`, `set_inspection_number`): pasan a ejecutarse con privilegios propios y `search_path` fijo, para que el usuario ya no necesite permiso directo sobre la función de folio. Así se arregla el error reportado en Cuentas por Pagar y los dos casos gemelos (entregas e inspecciones) que hoy tienen la misma bomba de tiempo.
2. **Folios pedidos directamente por la app** (`next_supplier_bill_number`, `next_contract_number`, `next_quote_number`): se les añade una verificación de rol interna (solo personal interno autorizado; nada de acceso anónimo ni de portal) y se les devuelve el permiso de ejecución únicamente a usuarios con sesión iniciada.
3. Los demás folios internos (facturas, notas de crédito, reservas) **no cambian**: nadie los llama directo desde la app, sus automatismos ya corren con privilegios propios.

## Verificación

- Consultar los permisos finales de cada función y confirmar que ninguna quedó abierta a `anon`.
- Simular como usuario `administrativo`: pedir folio de proveedor e insertar una factura de proveedor de prueba, más una entrega y una inspección.
- Confirmar que un usuario del portal recibe "acceso denegado" al intentar pedir un folio.
- Añadir el caso a las suites SQL de `supabase/tests/rls/` para que la regresión quede cubierta en CI.

## Detalles técnicos

- Causa raíz confirmada: `public.next_supplier_bill_number()` tiene ACL `postgres=X | service_role=X`; `set_supplier_bill_number()` es un trigger con `prosecdef = false`, por lo que el `EXECUTE` se evalúa con el rol `authenticated`.
- Cambios: `SECURITY DEFINER` + `SET search_path = public` en las 3 funciones trigger; guard con `public.is_staff()` / `has_role` dentro de las 3 funciones de folio expuestas + `GRANT EXECUTE ... TO authenticated` (sin `anon`).
- Se cumplen las reglas permanentes de migraciones: `SECURITY DEFINER` con `search_path` y guard de rol, sin `USING (true)`, sin exponer nada a `anon`.
- Sin cambios en el frontend: `useSupplierBillMutations.ts`, `useContracts.ts` y `useQuotes.ts` siguen llamando los mismos RPC.
- Changelog: versión patch (7.300.1) en `CHANGELOG.md`, `public/changelog.json` y `public/version.json`.
