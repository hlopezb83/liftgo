# LiftGo multi-organización — plan técnico por fases

Objetivo: que LiftGo pueda operar varias organizaciones en la misma base, sin selector de organización para usuarios internos y sin acceso cruzado posible.

## Estado actual verificado

- 59 tablas en `public`, 227 políticas de seguridad, 493 funciones (252 con privilegios elevados). Ninguna tiene hoy el concepto de organización.
- Los datos de la empresa son un registro único: `company_settings` 1 fila, `billing_secrets` 1 fila (llaves de Facturapi), `invoice_number_settings` 1 fila. El código las lee con "el primer registro" (por ejemplo en ajustes de empresa y en los PDF), lo cual deja de ser correcto con varias organizaciones.
- `customers` tiene 25 registros y solo 1 con acceso al portal (`user_id`). No existe restricción de unicidad sobre `user_id`: hoy dos clientes podrían compartir el mismo acceso.
- 5 perfiles internos y 5 asignaciones de rol.
- 6 depósitos de archivos, todos privados: `documents`, `cfdi-files`, `payment-proofs`, `supplier-payment-receipts`, `supplier-bill-cfdi-xml`, `feedback-screenshots`.

Lo bueno: el volumen de datos es pequeño, así que la migración es de bajo riesgo en datos y de alto riesgo en cobertura (hay que no olvidar ninguna tabla ni función).

## Modelo final propuesto

```text
organizations (id, nombre, slug, activa)
        |
        +-- organization_members (user_id, organization_id UNIQUE por user_id, rol)   -> usuario interno: 1 sola org
        |
        +-- customers (organization_id)                 -> ficha comercial por organización
        |
        +-- customer_portal_users (user_id UNIQUE global, customer_id, organization_id)
                                                        -> un email/acceso = 1 cliente = 1 organización
        |
        +-- company_settings / billing_secrets / invoice_number_settings
                                                        -> 1 fila por organización (UNIQUE organization_id)
```

- Regla 1: `organization_members.user_id` con restricción única global. Un usuario interno no puede pertenecer a dos organizaciones, así que no hace falta selector.
- Regla 2 y 3: el mismo cliente comercial en dos organizaciones se representa como dos fichas `customers` (una por organización), o como una entidad comercial compartida `commercial_entities` con una ficha por organización. Recomendación: empezar con dos fichas separadas (más simple, sin cambios de UI) y dejar `commercial_entities` como fase posterior opcional si se pide "ver al mismo cliente en ambas".
- Acceso al portal: se retira `customers.user_id` del uso y se sustituye por `customer_portal_users`, con `user_id` único global. Como cada email es un usuario distinto, la regla "un acceso pertenece a una sola organización" queda garantizada por la propia tabla.

## Qué necesita `organization_id`

Todas las tablas de negocio: bookings, quotes, contracts, invoices, credit_notes, payments, customer_payment_intents, deliveries, forklifts, equipment_models, maintenance_*, parts_inventory, damage_records, return_inspections, suppliers y toda la cadena de cuentas por pagar, bancos y conciliación, documents, activity_feed, notifications, audit_logs, status_logs, operating_expenses, prospects, fiscal_periods, contract_templates, feedback_reports, drivers, mechanics, user_manual, webhook_events, cfdi_retry_queue, rate_limits.

Excepciones (no llevan organización): `organizations`, `organization_members`, `profiles` (identidad), `role_permissions` (catálogo global).

Funciones que hay que revisar sí o sí: todas las de numeración (`assign_booking_number`, `assign_quote_number`, `next_contract_number`, `peek_next_draft_invoice_number`, `assign_stamped_invoice_number`, `assign_stamped_credit_note_number`, `assign_stamped_rep_number`), las de creación/cambio de estado (`create_booking`, `extend_booking`, `convert_quote_to_bookings`, `change_forklift_status`, `complete_delivery`, `complete_return_inspection`), las financieras (`customer_outstanding_balance`, `get_dashboard_stats`, tableros y reportes), y las de ajustes (`get_billing_secrets_status`, `upsert_billing_secret`, `get_public_branding`).

Regla nueva: la numeración de documentos debe ser única **por organización y por año**, no global, y los contadores deben tomar el candado por organización.

## Orden seguro de migraciones

1. Crear `organizations`, `organization_members`, `customer_portal_users` con sus permisos y políticas. Insertar la organización actual y asignarle los 5 usuarios internos y el único acceso de portal existente.
2. Añadir `organization_id` **nullable** a todas las tablas de negocio, con índice.
3. Rellenar con la organización actual (todos los datos existentes son de ella).
4. Añadir valor por defecto derivado del usuario que escribe, y disparadores que impidan mezclar organizaciones entre una fila y sus relaciones (por ejemplo, factura y reserva deben coincidir).
5. Marcar `organization_id` como obligatorio (NOT NULL) una vez que el código ya lo envía.
6. Reescribir políticas de acceso: toda tabla filtra por la organización del usuario; el portal filtra además por su cliente.
7. Reescribir numeración y ajustes por organización: `UNIQUE (organization_id)` en `company_settings`, `billing_secrets`, `invoice_number_settings`; folios únicos por organización.
8. Reglas de archivos: rutas con la organización al inicio (`<org>/<entidad>/<archivo>`) y políticas de acceso que la comprueben.
9. Solo al final: dejar de usar `customers.user_id` (se conserva la columna, no se elimina).

## Frontend y portal

- Añadir una lectura única de "mi organización" y hacer que la clave de caché de cada consulta la incluya, para que nunca se mezclen datos al cambiar de sesión.
- Sustituir las lecturas de "el primer registro" por lecturas filtradas por organización en: ajustes de empresa, umbral de aprobación, plantillas de contrato, PDFs, estado de conciliación, manual y ubicación de montacargas.
- Alta de cliente al portal: el formulario debe pedir un email distinto por organización y explicar el motivo; el error de email repetido debe decir "ese correo ya se usa en otra organización".
- Sin selector de organización en la interfaz interna. Al no haber selector, el único riesgo es olvidar un filtro: por eso el filtro vive en la base de datos, no en el frontend.
- Marca visible (logo/razón social) resuelta por organización, incluida la pantalla pública del portal.

## Matriz de pruebas cruzadas

Con dos organizaciones A y B y un cliente comercial presente en ambas con dos correos distintos:

| Caso | Esperado |
|---|---|
| Usuario interno de A lista reservas, facturas, montacargas, proveedores, bancos | solo datos de A |
| Usuario interno de A abre por enlace directo un registro de B | no encontrado |
| Usuario interno de A intenta crear un registro declarando la organización B | rechazado |
| Portal del cliente con el correo de A | solo facturas/contratos de A |
| El mismo cliente con el correo de B | solo datos de B |
| Numeración: A y B emiten factura el mismo día | folios independientes, sin colisión |
| Facturación: A y B con llaves distintas | cada timbrado usa la llave de su organización |
| Archivos: usuario de A pide un archivo de B | denegado |
| Tareas programadas y facturación recurrente | procesan cada organización por separado |
| Reportes y tablero | totales por organización, nunca sumados |

## Riesgos y decisiones pendientes

- Riesgo principal: olvidar una función con privilegios elevados (hay 252) y que siga leyendo todo. Mitigación: prueba automática que falle si una tabla de negocio no tiene columna de organización o una política sin filtro.
- Las tareas programadas y las funciones de servicio saltan las reglas de acceso por diseño: deben recibir la organización como parámetro explícito.
- Decisión pendiente 1: ¿ficha de cliente duplicada por organización o entidad comercial compartida?
- Decisión pendiente 2: ¿los folios arrancan de nuevo en 1 para cada organización nueva, o conservan el contador actual para la organización existente? (propuesta: la actual conserva, las nuevas empiezan en 1).
- Decisión pendiente 3: ¿los montacargas pueden compartirse entre organizaciones o pertenecen a una sola? (propuesta: a una sola).
- Decisión pendiente 4: ¿cómo se crea una organización nueva y quién la administra?

## Criterios de aceptación

- Ninguna consulta del código lee "el primer registro" de ajustes, llaves o numeración.
- Toda tabla de negocio tiene organización obligatoria y política que filtra por ella.
- Toda la matriz de pruebas cruzadas pasa.
- No existe selector de organización y ningún usuario interno pertenece a dos.
- Los datos actuales quedan íntegros en la organización existente.

## Primera tarea implementable

Fase 0, sin tocar el resto del sistema: crear `organizations`, `organization_members` y `customer_portal_users` con sus permisos y políticas, la función auxiliar `current_organization_id()`, insertar la organización actual, asignar los 5 usuarios internos y migrar el único acceso de portal. Nada del código existente cambia de comportamiento todavía, y queda la base para las fases siguientes.
