# Auditoría R10 — Plan de aplicación

Verifiqué en el código y en la base de datos los 6 hallazgos del reporte: **todos son reales**. Aplico los 4 bloqueantes + los 2 P2 con diff, y dejo la lista P2 sin diff para una segunda tanda.

## Hallazgos confirmados

| ID | Verificación |
|----|--------------|
| R10-FE-01 (P0) | `RentalLineRow.tsx:31` y `SaleLineRow.tsx:27` pasan el valor del Select sin guard; los toggles de descuento en esos mismos archivos ya usan `if (v)`, así que el patrón ya existe en el proyecto. |
| R10-DB-01 (P1) | La base de datos otorga hoy `EXECUTE` de `expire_stale_quotes` a `authenticated`; la función es SECURITY DEFINER y actualiza por `valid_until` sin filtro de tenant. No hay llamadas desde `src/`. |
| R10-FE-02 (P1) | `DateRangePickerField.tsx` auto-aplica cualquier rango con `from` y `to`, y el footer no tiene botón "Aplicar". |
| R10-FE-03 (P1) | `useQuotePrefill.ts:66-67` lee `item.quantity` (ignora `qty`) y usa `item.total` como tarifa diaria. |
| R10-DB-02 (P2) | La función viva `start_repair_work_order` no usa `today_mty()`; conserva `CURRENT_DATE`. |
| R10-FE-04 (P2) | `InviteUserDialog.tsx:106` sólo se protege con `isPending`, sin guard de ref. |

## Qué se va a cambiar

**1. Selects de líneas de cotización (bloqueante).** Ignorar valores vacíos que emite el select oculto de Radix al hidratar el formulario, para que al editar una cotización existente no se borren modelo ni tarifas.

**2. Permisos de expiración de cotizaciones (seguridad).** Migración que quita el permiso a usuarios normales y deja la ejecución sólo al proceso automático, con un guard interno adicional.

**3. Selector de rango de fechas.** El primer clic deja de tratarse como rango completo: se muestra "… — selecciona fin" y el diálogo sigue abierto. Un rango real (dos fechas distintas) se sigue aplicando solo; un rango de un día se confirma con el nuevo botón "Aplicar".

**4. Totales fantasma en cotizaciones legacy.** Leer la cantidad como `qty ?? quantity` y no inventar tarifa diaria a partir del total de la partida.

**5. Zona horaria en apertura de OT (P2).** Reaplicar `start_repair_work_order` copiando el cuerpo actual y cambiando únicamente `CURRENT_DATE` por `today_mty()`.

**6. Doble submit en invitación de usuario (P2).** Guard con `useRef` igual al de `FormActions`.

## Pruebas

- Tests unitarios nuevos: guard de `""` en las filas de líneas, `lineToRentalLineFallback` con partidas `qty`/`total`, y lógica de auto-aplicado del rango (`from==to` no aplica, `from!=to` sí).
- Smoke SQL `r10_smoke.sql`: ACL de `expire_stale_quotes` sin `authenticated`, y `start_repair_work_order` usando `today_mty()`.
- Verificación visual con Playwright de edición de cotización y del selector de rango.
- `tsgo --noEmit`, `bun run lint` y suite de vitest.

## Versionado

Entrada nueva en `CHANGELOG.md`, `public/changelog.json`, `public/changelog/v7.274.0.json`, `package.json` y `public/version.json` como **v7.274.0** (minor: cambios de comportamiento + migraciones).

## Fuera de alcance en esta tanda

Los 7 puntos P2 sin diff del apartado 5 (mensaje del trigger de pagos, historial "— → —", falso dirty, contraste del badge "Vencida", `changed_by` en /activity, flags de React Router, borradores en export SPEI). Se pueden ejecutar en una tanda posterior si lo apruebas.
