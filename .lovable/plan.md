# LiftGo multi-organización — plan técnico por fases (arquitectura aprobada)

Objetivo: que LiftGo pueda operar varias organizaciones en la misma base, sin selector de organización (ni para usuarios internos ni en el portal) y sin acceso cruzado posible.

Esta es la arquitectura **aprobada** para implementar después; las secciones de modelo no quedan a discusión.

## Estado actual verificado

- 59 tablas en `public`, 227 políticas de seguridad, 493 funciones (252 con privilegios elevados). Ninguna tiene hoy el concepto de organización.
- Los datos de la empresa son un registro único: `company_settings` 1 fila, `billing_secrets` 1 fila (llaves de Facturapi), `invoice_number_settings` 1 fila. El código las lee con "el primer registro" (ajustes de empresa, umbral de aprobación, PDFs), lo cual deja de ser correcto con varias organizaciones.
- `customers` tiene 25 registros y solo 1 con acceso al portal (`user_id`). No existe restricción de unicidad sobre `user_id`.
- 5 perfiles internos y 5 asignaciones de rol.
- 6 depósitos de archivos, todos privados: `documents`, `cfdi-files`, `payment-proofs`, `supplier-payment-receipts`, `supplier-bill-cfdi-xml`, `feedback-screenshots`.

Volumen de datos pequeño: el riesgo está en la cobertura (no olvidar ninguna tabla ni función), no en los datos.

## Modelo final aprobado

```text
organizations (id, nombre, slug, activa)

organization_memberships (auth_user_id UNIQUE GLOBAL, organization_id, tipo: interno|portal, rol)
        -> ningún auth user puede pertenecer a dos organizaciones, sea interno o cliente

customers  -> identidad global mínima del cliente comercial
              (id, nombre legal, rfc opcional, notas globales)
              NO lleva organization_id, NO lleva user_id

organization_customers (organization_id, customer_id, ...datos comerciales y fiscales
                        propios de esa relación: alias, régimen, uso CFDI, CP fiscal,
                        crédito, tarifa, contacto, estado)
        PK compuesta (organization_id, customer_id)
        + clave única sustituta organization_customer_id para FKs simples

customer_portal_accounts (id, organization_id, customer_id, auth_user_id UNIQUE GLOBAL,
                          email UNIQUE GLOBAL, status)
        FK compuesta -> organization_customers (organization_id, customer_id)
        una cuenta pertenece a UNA sola organización
```

Claves del modelo:

- **Cliente compartido**: el mismo cliente comercial existe una sola vez en `customers` y se relaciona con cada organización mediante una fila en `organization_customers`. No se duplican fichas.
- **Datos fiscales y comerciales por relación**: régimen, uso de CFDI, CP fiscal, tarifas y crédito viven en `organization_customers`, porque cada organización factura a su manera.
- **Tablas operativas**: llevan `organization_id` y `customer_id` con **FK compuesta** hacia `organization_customers (organization_id, customer_id)`, o bien la columna `organization_customer_id`. Así la base impide que una factura de la organización A apunte a una relación de la organización B.
- **Portal**: `customer_portal_accounts` sustituye a `customers.user_id`. Cada organización exige un email distinto y, por tanto, un usuario de acceso distinto. Una cuenta de portal que pertenezca a varias organizaciones **NO está permitida** por esta regla; la organización se deriva de la cuenta con la que el cliente inició sesión, sin selector.
- **Unicidad global de pertenencia**: `organization_memberships.auth_user_id` es único globalmente y cubre tanto usuarios internos como cuentas de portal. Ningún acceso puede ver dos organizaciones.

### Nota de migración del acceso al portal

`customers.user_id` y la función actual `get_customer_id_for_user()` son el punto de entrada del portal hoy. Deben migrar así:

1. Cada `customers.user_id` no nulo genera una fila en `customer_portal_accounts` con la organización actual y el email del usuario.
2. `get_customer_id_for_user()` se reescribe para leer de `customer_portal_accounts` y devolver **el cliente y también la organización** (o se divide en `current_portal_customer_id()` y `current_organization_id()`).
3. Todas las políticas y funciones del portal pasan a filtrar por ambos valores, no solo por cliente.
4. `customers.user_id` se deja de usar y se conserva la columna hasta que ninguna función la referencie; no se elimina en la misma fase.

## Qué necesita `organization_id`

Todas las tablas de negocio: bookings, quotes, contracts, invoices, credit_notes, payments, customer_payment_intents, deliveries, forklifts, equipment_models, maintenance_*, parts_inventory, damage_records, return_inspections, suppliers y toda la cadena de cuentas por pagar, bancos y conciliación, documents, activity_feed, notifications, audit_logs, status_logs, operating_expenses, prospects, fiscal_periods, contract_templates, feedback_reports, drivers, mechanics, user_manual, webhook_events, cfdi_retry_queue, rate_limits.

Las que además apuntan a un cliente (bookings, quotes, contracts, invoices, credit_notes, payments, deliveries, damage_records, prospects, customer_payment_intents, documents) llevan la FK compuesta contra `organization_customers`.

Excepciones (sin organización): `organizations`, `organization_memberships`, `customers` (identidad global), `profiles` (identidad), `role_permissions` (catálogo global).

Funciones a revisar sí o sí: numeración (`assign_booking_number`, `assign_quote_number`, `next_contract_number`, `peek_next_draft_invoice_number`, `assign_stamped_invoice_number`, `assign_stamped_credit_note_number`, `assign_stamped_rep_number`), creación/cambio de estado (`create_booking`, `extend_booking`, `convert_quote_to_bookings`, `change_forklift_status`, `complete_delivery`, `complete_return_inspection`), financieras (`customer_outstanding_balance`, `get_dashboard_stats`, reportes y tableros), ajustes (`get_billing_secrets_status`, `upsert_billing_secret`, `get_public_branding`) y todo el portal (`accept_quote_from_portal`, `customer_owns_invoice`, `customer_can_read_document_object`).

Regla nueva: la numeración de documentos es única **por organización y año**, con el candado tomado por organización.

## Orden seguro de migraciones

1. Crear `organizations`, `organization_memberships`, `organization_customers` y `customer_portal_accounts`, con permisos, políticas y las funciones auxiliares `current_organization_id()` y `current_portal_customer_id()`. Insertar la organización actual, asignar los 5 usuarios internos, generar una fila de `organization_customers` por cada uno de los 25 clientes y migrar el único acceso de portal.
2. Añadir `organization_id` **nullable** (y `customer_id` donde falte) a todas las tablas de negocio, con índices.
3. Rellenar con la organización actual: todos los datos existentes le pertenecen.
4. Añadir las FK compuestas hacia `organization_customers` y disparadores que impidan mezclar organizaciones entre una fila y sus relaciones (factura ↔ reserva ↔ contrato).
5. Marcar `organization_id` como obligatorio una vez que el código ya lo envía.
6. Reescribir políticas de acceso: toda tabla filtra por la organización de la membresía; el portal filtra además por su cliente.
7. Ajustes y numeración por organización: `UNIQUE (organization_id)` en `company_settings`, `billing_secrets` e `invoice_number_settings`; folios únicos por organización.
8. Archivos: rutas con la organización al inicio (`<org>/<entidad>/<archivo>`) y políticas que la comprueben.
9. Retirar el uso de `customers.user_id` y de la versión antigua de `get_customer_id_for_user()`.

## Frontend y portal

- Lectura única de "mi organización" derivada de la membresía; la clave de caché de cada consulta la incluye, para que nunca se mezclen datos entre sesiones.
- Sustituir las lecturas de "el primer registro" por lecturas filtradas por organización: ajustes de empresa, umbral de aprobación, plantillas de contrato, PDFs, estado de conciliación, manual y ubicación de montacargas.
- La ficha de cliente muestra los datos globales de `customers` más los datos de la relación de la organización activa; solo estos últimos son editables desde la organización.
- Alta al portal: el formulario pide un email distinto por organización y lo explica; si el correo ya existe, el mensaje dice que ese correo ya se usa en otra organización y hay que dar uno diferente.
- Sin selector de organización en ninguna parte: interna por membresía, portal por la cuenta con la que se inició sesión.
- Marca visible (logo y razón social) resuelta por organización, incluida la pantalla pública del portal.

## Matriz de pruebas cruzadas

Escenario base: un mismo cliente comercial (una sola fila en `customers`) relacionado con las organizaciones A y B, con dos emails distintos y dos usuarios de acceso distintos.

| Caso | Esperado |
|---|---|
| Usuario interno de A lista reservas, facturas, montacargas, proveedores, bancos | solo datos de A |
| Usuario interno de A abre por enlace directo un registro de B | no encontrado |
| Usuario interno de A crea un registro declarando la organización B | rechazado |
| Usuario interno de A edita datos fiscales del cliente | cambia solo la relación de A; la de B queda intacta |
| Factura de A que apunta a la relación cliente–B | rechazada por la FK compuesta |
| Cliente entra con el email de A | ve solo facturas, contratos y cotizaciones de A |
| El mismo cliente entra con el email de B | ve solo los de B, sin rastro de A |
| Intentar dar de alta el email de A también en B | rechazado: exige email nuevo |
| Intentar ligar un mismo usuario de acceso a dos organizaciones | rechazado por unicidad global de membresía |
| Numeración: A y B emiten factura el mismo día | folios independientes, sin colisión |
| Facturación: A y B con llaves distintas | cada timbrado usa la llave de su organización |
| Archivos: usuario de A pide un archivo de B | denegado |
| Tareas programadas y facturación recurrente | procesan cada organización por separado |
| Reportes y tablero | totales por organización, nunca sumados |

## Riesgos y decisiones pendientes

- Riesgo principal: olvidar una función con privilegios elevados (hay 252) y que siga leyendo todo. Mitigación: prueba automática que falle si una tabla de negocio no tiene columna de organización o si existe una política sin filtro por organización.
- Riesgo secundario: datos fiscales que hoy viven en `customers` y deben moverse a `organization_customers` sin romper facturación; se migran copiando a la relación de la organización actual antes de dejar de leer las columnas viejas.
- Las tareas programadas y funciones de servicio saltan las reglas de acceso por diseño: deben recibir la organización como parámetro explícito.
- Decisión pendiente 1: ¿los folios arrancan de nuevo en 1 para cada organización nueva, o la actual conserva su contador? (propuesta: la actual conserva, las nuevas empiezan en 1).
- Decisión pendiente 2: ¿los montacargas pueden compartirse entre organizaciones o pertenecen a una sola? (propuesta: a una sola).
- Decisión pendiente 3: ¿cómo se crea una organización nueva y quién la administra?

(La elección entre ficha duplicada y entidad compartida ya no es una decisión: queda fijada a entidad global `customers` más tabla puente `organization_customers`.)

## Criterios de aceptación

- Ninguna consulta del código lee "el primer registro" de ajustes, llaves o numeración.
- Toda tabla de negocio tiene organización obligatoria y política que filtra por ella; las que apuntan a cliente tienen FK compuesta.
- Ningún usuario de acceso pertenece a dos organizaciones, ni interno ni de portal.
- Toda la matriz de pruebas cruzadas pasa.
- No existe selector de organización en ninguna pantalla.
- Los datos actuales quedan íntegros en la organización existente.

## Primera tarea implementable

Fase 0, sin cambiar el comportamiento actual: crear `organizations`, `organization_memberships`, `organization_customers` y `customer_portal_accounts` con permisos y políticas, más las funciones `current_organization_id()` y `current_portal_customer_id()`. Insertar la organización existente, asignar los 5 usuarios internos, generar la relación de los 25 clientes y migrar el único acceso de portal. El resto del sistema sigue funcionando igual y queda la base para las fases siguientes.
