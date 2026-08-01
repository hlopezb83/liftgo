# Ronda 9 — estado real y cierre de pruebas (v7.273.2)

## Respuesta corta

**Cambios: sí, aplicados** — los 6 bloqueantes en v7.273.0 y los 7 detalles P2 en v7.273.1.
**Pruebas: no todos.** 4 de los 13 arreglos quedaron sin prueba que los proteja, incluida la prueba E2E que la propia auditoría exigía como condición de GO.

## Estado verificado

| Arreglo | Aplicado | Prueba |
|---|---|---|
| P0 precarga de cotización | Sí | Unitaria sí — **E2E lista→detalle→editar falta** (la auditoría dice que la unitaria no lo detecta) |
| Cotizaciones legacy precargan | Sí | Unitaria sí |
| Familia de zona horaria (`today_mty()`) | Sí | Sólo utilidades de fecha — **sin smoke SQL** |
| Ventas ve historial de prospectos | Sí | **Sin prueba** |
| Badge del detalle de unidad | Sí | Sólo la utilidad de cálculo — **el componente sin prueba** |
| Doble submit | Sí | Sí |
| `/customers/new` | Sí | Sí |
| Los 7 detalles P2 (v7.273.1) | Sí | **Ninguno tiene prueba** |

Un pendiente real del documento quedó fuera: en la sección P2 se pide, además de los prefijos hexadecimales, distinguir el actor **"Sistema"** en /activity (hoy cualquier registro sin autor se muestra igual, sea automático o sin identificar).

## Qué construir

### 1. Prueba E2E de la precarga de cotización (la que pide la auditoría)
Nueva especificación que reproduce la ruta exacta que fallaba: entrar a la lista de cotizaciones, abrir el detalle, pulsar Editar **sin recargar** la página, y comprobar que la partida de renta conserva modelo, cantidad y tarifas, que los totales no son $0.00 y que Guardar está habilitado. Segundo caso: una cotización antigua sin metadatos de renta también precarga.

### 2. Pruebas unitarias de los bloqueantes sin cobertura
- Historial de prospectos: se muestra para Ventas, Admin, Administrativo y Auditor; se niega para Mecánico y Despachador.
- Detalle de unidad: una unidad con reserva vigente muestra el estado derivado, no el crudo.

### 3. Pruebas de los 7 detalles P2
- Rechazo de cotización envía `rejected_at`.
- La columna de aprobación muestra guion cuando la factura de proveedor está pagada o cancelada, y el estado normal en el resto.
- Detalle de cotización inexistente devuelve "no encontrada" sin lanzar error.
- Reportar transferencia mayor al saldo muestra el mensaje con el saldo exacto.
- Bitácora: `user_roles` etiqueta con el nombre del rol y `profiles` con nombre o correo; el resto de tablas mantiene su etiqueta actual.
- Lista de entregas: usa el nombre incluido en la consulta y sólo cae al mapa como respaldo.
- Rango de fechas: al elegir la fecha final se aplica y cierra; ampliar la especificación E2E existente para verificar que ya no hay botón "Aplicar".

### 4. Smoke SQL de la Ronda 9
Archivo `supabase/tests/r9_smoke.sql`, igual que los de rondas 3 y 4: comprueba que `today_mty()` existe y coincide con la fecha de Monterrey, que ninguna función de reportes usa la fecha UTC, y que la vista de vencidas se apoya en `today_mty()`.

### 5. Actor "Sistema" en la bitácora de actividad
Distinguir en pantalla un evento automático de uno cuyo autor no se pudo identificar, en lugar de mostrar "Sistema" para ambos casos.

## Detalles técnicos

- E2E en `tests/e2e/quote-edit-prefill.spec.ts`, apoyada en `e2e_seed_scenario` para crear una cotización con `rental_meta` completa y otra legacy; teardown con `e2e_teardown`.
- Unitarias junto a cada módulo: `src/features/crm/components/__tests__/`, `src/features/fleet/.../__tests__/`, `src/features/accounts-payable/components/__tests__/supplierBillColumns.test.tsx`, `src/features/audit/lib/__tests__/buildLabel.test.ts`, `src/features/deliveries/pages/__tests__/`, `src/features/portal/components/__tests__/`.
- La etiqueta de bitácora se probará extrayendo `buildLabel` a un módulo exportable si hoy es privado.
- Ampliar `tests/e2e/daterange-picker.spec.ts` con la aserción de cierre automático.
- Versión resultante: `v7.273.2` (patch) en `package.json`, `public/version.json`, `public/changelog.json` y `public/changelog/v7.273.2.json`.
