## Estado verificado

De la lista R22, en la ronda anterior ya quedaron aplicados: D (zebra), E/F (columnas de dinero), G (orden de botones en `FormActions` — ya está Cancelar → primaria), I (invalidar detalle de cotización), K parcial (KpiTile sin truncar), L (eje Y compacto), O, P, Q, R, T, V y W (nulos al final al ordenar).

Confirmé con búsquedas que **siguen abiertos**:

- `isDirty=` no aparece en ningún consumidor de `FormDialog` (0 usos reales) → R22-A vigente.
- Ningún archivo de `src/features/reports` importa `QueryErrorState` → R22-B vigente.
- `CalendarPage` sólo usa `bError`/`bRefetch`; no toca `useForklifts` → R22-C vigente.
- `PortalLogin` sigue mostrando el error crudo del backend (inglés) → R22-M vigente.

## Qué haré

### 1. Protección contra pérdida de datos en modales (R22-A)
Pasar `isDirty` a los `FormDialog` de formularios reales (no a los de confirmación ni de un solo campo):
Cliente, Proveedor, Contacto/Cuenta bancaria de proveedor, Refacción, Prospecto, Registrar pago, Editar pago, Reportar daño, Factura de proveedor, Registrar pago a proveedor, Orden de mantenimiento, Entrega, Modelos de equipo, Mecánicos, Choferes, Feedback.
- Donde hay React Hook Form: `form.formState.isDirty`.
- Donde el estado es manual (Prospecto, Registrar pago): derivar un `isDirty` comparando los campos contra su estado inicial.

### 2. Error states en los reportes (R22-B)
Agregar `QueryErrorState` con reintento a: Utilización, Utilización por modelo, Ingresos, Costos de mantenimiento, Antigüedad de saldos, Estado de resultados y Rentabilidad por modelo. Así, si falla la red ya no se ve "Sin datos" ni se exporta CSV vacío.

### 3. Calendario: reintento completo (R22-C)
Entrar al estado de error también cuando falla la carga de montacargas, y que "Reintentar" recargue ambas consultas.

### 4. Prospecto: validación en español (R22-H)
Quitar el `required` nativo, agregar `noValidate` al formulario y mostrar el mensaje del esquema debajo del campo "Empresa", igual que el error de valor del trato.

### 5. Login del portal en español (R22-M)
"Invalid login credentials" → "Correo o contraseña incorrectos"; cualquier otro fallo → "No se pudo iniciar sesión. Inténtalo de nuevo."

### 6. KPIs con montos grandes (R22-K, cierre)
En Dashboard (MRR, cartera), KPIs de Cuentas por pagar y resumen de flujo de efectivo: mostrar el monto compacto ("$1.23 M") con el valor exacto al pasar el cursor.

### 7. Detalles de impresión y copy (R22-J, N, S, U)
- `no-print` en barras de acciones y paginadores de Clientes, Facturas, Contratos y del portal.
- Botones y títulos a mayúscula inicial simple: "Nuevo cliente", "Nueva factura", "Nueva cotización", "Nuevo contrato", "Nuevo proveedor", "Agregar montacargas", "Reportar daño".
- Leyenda del Gantt: swatch "Confirmada" consistente con el color real de las barras.
- Tabla de facturas del portal migrada al componente `Table` del sistema.

## No incluido
Los "PENDIENTES" del documento (migración masiva de `meta.kind`, facelift del portal, kanban optimista, empty states con CTA) quedan fuera de esta ronda; son sprints propios.

## Detalles técnicos
- Archivos principales: ~16 diálogos en `src/features/**`, 7 reportes en `src/features/reports/components/reports/`, `CalendarPage.tsx`, `PortalLogin.tsx`, `ProspectFormFields.tsx` + `ProspectFormDialog.tsx`, toolbars de listas.
- Verificación: `bun run lint`, `bunx vitest run`, y revisión visual en preview de un modal con cambios sin guardar + un reporte en modo offline.
- Changelog: nueva entrada v7.250.0 en `public/changelog.json` + `public/changelog/v7.250.0.json`.
