# Cierre de la Ronda G: últimos 3 hallazgos abiertos

Ya quedaron corregidos los temas de moneda en pagos a proveedor, la expiración de sesión, el CSV del estado de resultados, el Pagaré y las guardas de rol en pantallas. Faltan tres hallazgos verificados.

## 1. Cerrar un deal como "Ganado" sin ser administrador (alto — seguridad)

Hoy la regla "solo admin o administrativo puede cerrar un prospecto como Ganado" vive únicamente en la pantalla (`useProspectGuard`). En la base de datos el rol *ventas* tiene acceso total a prospectos y los disparadores solo revisan la etapa previa y el monto final, no quién hace el cambio.

Analogía: la puerta del almacén tiene un letrero que dice "solo gerentes", pero la cerradura no pide credencial. Basta rodear la pantalla para entrar.

Qué se hará: mover la regla a la base de datos, de modo que cualquier intento de dejar un prospecto en `cerrado_ganado` (al crear o al actualizar) falle si quien lo hace no es admin o administrativo. La pantalla sigue mostrando el mismo mensaje amable, pero ahora la cerradura sí pide credencial.

## 2. Cuentas por Pagar no avisa de facturas sin tipo de cambio (medio)

El reporte de antigüedad ya excluye y avisa de facturas en dólares sin tipo de cambio capturado. La portada de Cuentas por Pagar hace la misma exclusión (se corrigió esta ronda) pero no lo dice: el usuario ve totales más bajos sin explicación.

Qué se hará: mostrar el mismo aviso que en antigüedad, arriba de las tarjetas de KPI, con el conteo de facturas excluidas.

## 3. El lote de dispersión no distingue facturas sin tipo de cambio (medio)

En la exportación de pagos ya se muestra la moneda de cada factura. Falta señalar las facturas en divisa que no tienen tipo de cambio, porque el operador no puede calcular el equivalente en pesos al dispersar.

Qué se hará: marcar esas filas con una etiqueta de advertencia y un aviso arriba de la tabla, sin bloquear la exportación.

## Detalles técnicos

- Migración SQL: `validate_prospect_close()` agrega un guard de rol cuando `NEW.stage = 'cerrado_ganado'` usando `has_role((select auth.uid()), 'admin')` o `'administrativo'`, con `SET search_path = public` y `ERRCODE = 'insufficient_privilege'` (42501). Se respeta `app.e2e_seed` para no romper el sembrado de pruebas. Sin tablas nuevas ni cambios de policies.
- `pgErrorCatalog.ts`: mensaje en español para el nuevo error de cierre no autorizado.
- `AccountsPayableKpiCards.tsx` / `CuentasPorPagarPage.tsx`: consumir `fxMissingCount` de `useAccountsPayableKpis` y renderizar el aviso reutilizando el patrón de `AgingReportPage`.
- `PaymentsExportTable.tsx` + `useExportablePayables.ts`: derivar `isFxMissing(currency, exchange_rate)` por fila; badge "Sin TC" en la columna Saldo y aviso agregado arriba de la tabla.
- Pruebas: casos nuevos en `useAccountsPayableKpis.test.ts` para el conteo, y prueba de la regla de rol en la suite local de RLS.
- Versión `7.374.0` (minor) con entradas en `public/changelog.json` y `CHANGELOG.md`.
