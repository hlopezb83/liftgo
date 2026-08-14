# Sprints M1–M3: 25 correcciones de severidad media

El archivo subido trae 25 parches organizados en 3 sprints independientes, cada uno con su nota de justificación. Antes de aplicar nada, cada hallazgo se valida contra el código actual; solo se implementan los que resulten reales.

## Verificación previa (muestra ya realizada)

- **Confirmado real (M1-03)**: `useInvoiceFormTotals` arma las líneas sin `objeto_imp` ni `tax_rate`, pero `computeTotals` sí los usa. El total en pantalla puede diferir del guardado en facturas con líneas exentas.
- **Confirmado real (M1-07)**: `supplierPaymentSchema` valida `payment_date` como fecha sin tope superior; se puede registrar un pago a proveedor con fecha futura, algo que el flujo de clientes ya bloquea.
- Los 23 restantes se verifican uno por uno al inicio de cada sprint; los que no se reproduzcan se reportan como no aplicables (como ya pasó antes con el hash bancario) en vez de aplicarse a ciegas.

## Sprint M1 — Dinero y documentos (7)

1. Extensiones respetan tarifas diaria y semanal pactadas en la reserva, no solo la mensual.
2. Renta anclada a día 29–31 que termina en mes corto deja de cobrar un día extra (31-ene → 28-feb = 1 mes exacto).
3. Preview de totales de factura considera `objeto_imp` y `tax_rate` por línea.
4. Notas de crédito calculan IVA línea por línea reusando `computeTotals`.
5. Conversión legacy de cotización deja de pisar tarifas con 0 (frontend + migración de la RPC `convert_quote_to_bookings`).
6. Factura de proveedor: descuento acotado al subtotal y retenciones contra la base neta.
7. Pago a proveedor rechaza fecha futura (esquema + calendario deshabilitado).

## Sprint M2 — Backend y portal (9)

1. `invite-customer` compensa (borra el usuario creado) si falla cualquier escritura encadenada.
2. Cancelación de REP entra a la cola de reintentos como CFDI y notas de crédito.
3. `classify-feedback`: deja de devolver el mensaje crudo del error y gana límite de uso.
4. `validate-supplier-rep`: límite de tamaño del archivo y límite de uso.
5. Migración RLS: el rol dispatcher pierde lectura de facturas, pagos y gastos operativos (lo que ya declara la matriz de roles).
6. `generate-manual`: límite de uso para la llamada de IA.
7. Portal: error de red al pagar muestra estado de error con reintento, no "cuenta no configurada".
8. Vigencia de cotización en el portal se evalúa en horario de Monterrey.
9. Formulario público de reporte de transferencia con límites de longitud y de rango de fecha.

## Sprint M3 — Robustez frontend (9)

1. Editar pago: tope contra el saldo y bloqueo de monto/fecha cuando el REP ya está timbrado.
2. Cuenta bancaria primaria del proveedor: manejo del conflicto de duplicado (más migración defensiva).
3. "Facturado" del contrato incluye reservas ligadas por la tabla pivote.
4. Guards de `sessionStorage` en filtros (ya aplicado en v7.321.2; se verifica y se descarta si es redundante).
5. `dashboard-stats` sale de la caché persistida en el navegador y se purga la versión anterior.
6. Daño en estado `reported` puede marcarse reparado sin orden de trabajo.
7. Conciliación bancaria: la tabla destino del match se elige por el tipo de candidato, no por el signo.
8. No se puede cambiar la moneda de una cuenta bancaria con movimientos importados.
9. El selector de entregas solo ofrece reservas confirmadas.

## Notas técnicas

- Tres migraciones nuevas (una por sprint). Se reescriben siguiendo las reglas permanentes del proyecto: `SET search_path = public`, guards de rol en funciones `SECURITY DEFINER`, `(select auth.uid())` en policies y GRANT explícitos. La de M2 solo elimina policies.
- Los parches no se aplican con `git apply` (no disponible); cada cambio se implementa a mano sobre el código actual, que ya divergió del commit base `v7.319.0` en varios de estos archivos.
- Puertas de calidad por sprint: `bunx vitest run`, `tsgo`, `bunx eslint`, `bunx knip`. Se añaden o actualizan pruebas para cada fix con lógica de negocio (extensiones, renta mes corto, totales, notas de crédito, esquemas de proveedor, conciliación).
- El fix M2-05 endurece permisos: si alguna pantalla del dispatcher lee esas tablas, dejará de mostrar filas. Se revisa el frontend del rol antes de aplicarlo.
- Fix M3-05 invalida la caché persistida de todos los usuarios una sola vez (efecto buscado para borrar los datos financieros ya guardados).

## Changelog

Tres entradas minor: `7.324.0` (M1), `7.325.0` (M2), `7.326.0` (M3) en `CHANGELOG.md`, `public/changelog.json`, `public/version.json` y `package.json`.

## Orden

M1 → M2 → M3, con verificación y pruebas al cierre de cada sprint. Se puede detener entre sprints.
