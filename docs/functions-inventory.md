# Inventario de funciones de `supabase/functions`

Clasificación del alcance multiempresa de cada endpoint activo. Regla general:
estas funciones corren con `service_role`, por lo que **las RLS no las
protegen**; el alcance por empresa tiene que estar escrito en el código.

La empresa **nunca** se toma del cuerpo de la petición: se deriva de
`organization_memberships` (funciones con usuario) o del propio documento que
se procesa (funciones de cron).

## Categorías

| Categoría | Cómo se determina la empresa |
| --- | --- |
| Tenant-scoped por caller | `resolveCallerOrganization(admin, userId)` y filtro `organization_id` explícito en cada lectura/escritura. Fail-closed. |
| Cron / service_role | Sin usuario: la empresa sale del documento procesado (factura, pago, póliza) y las escrituras derivadas heredan ese `organization_id`. |
| Global explícito | Opera sobre datos que no pertenecen a una empresa, o sobre una tabla cuyo `organization_id` es nulo por decisión de producto. |
| Retirado | Devuelve 410; sustituido por una ruta de la aplicación con alcance por empresa. |

## Endpoints

| Función | Categoría | Notas |
| --- | --- | --- |
| `classify-feedback-report` | Tenant-scoped por caller | Endurecido (P1): empresa resuelta antes de consultar AI; `feedback_reports` se lee y actualiza con `organization_id`. Un id de otra empresa responde 404 sin consumir AI. Ruta preferida: `src/lib/feedbackAi.functions.ts`. |
| `validate-supplier-rep` | Tenant-scoped por caller | Endurecido (P1): `supplier_payments`, `supplier_bills`, la búsqueda de UUID duplicado y la actualización filtran por empresa; `activity_feed` lleva `organization_id`; las rutas de Storage derivan de `bill.organization_id`. Ruta preferida: `src/lib/supplierRep.functions.ts`. |
| `stamp-cfdi`, `stamp-credit-note`, `stamp-payment-complement` | Tenant-scoped por caller | Timbrado fiscal sobre documentos de la empresa del usuario. |
| `cancel-cfdi`, `cancel-credit-note`, `cancel-payment-complement` | Tenant-scoped por caller | Cancelación sobre documentos de la empresa del usuario. |
| `download-cfdi`, `refresh-cancellation-status` | Tenant-scoped por caller | Lecturas fiscales acotadas al documento de la empresa. |
| `validate-customers-tax-info`, `validate-receptor-tax-info` | Tenant-scoped por caller | Validación SAT sobre la cartera de la empresa del usuario. |
| `process-cfdi-retry-queue` | Cron / service_role | Empresa derivada del documento en la cola. |
| `reconcile-stamping-invoices` | Cron / service_role | Empresa derivada de la factura reconciliada. |
| `generate-recurring-invoices` | Cron / service_role | Empresa derivada de la reserva/contrato origen. |
| `generate-recurring-maintenance` | Cron / service_role | Empresa derivada de la póliza de mantenimiento. |
| `migrate-storage-org-prefix` | Cron / service_role | Herramienta de migración; `apply` exige además un secreto explícito. |
| `generate-manual` | Global explícito | `user_manual.organization_id` es nulable por decisión de producto y la interfaz la invoca directamente: el manual es contenido de producto, no dato de una empresa. Convertirla en tenant-scoped requiere una decisión de producto previa. |
| `parse-csf` | Global explícito | Sólo interpreta el PDF de la Constancia de Situación Fiscal que se le envía; no lee ni escribe tablas con `organization_id`. |
| `delete-user`, `invite-user`, `invite-customer`, `reset-user-password`, `toggle-user-status` | Retirado | Devuelven 410. Sustituidos por `src/lib/userAdmin.functions.ts` y `src/lib/customerPortal.functions.ts`, con alcance por empresa. |

## Por qué las funciones globales no llevan `organization_id`

`generate-manual` y `parse-csf` no consultan ni modifican datos de negocio de
una empresa: la primera genera contenido de ayuda común (tabla con
`organization_id` nulable) y la segunda transforma un archivo recibido en la
propia petición. Añadirles un filtro de empresa no aumentaría el aislamiento y
sí rompería consumidores actuales.

## Compatibilidad

`classify-feedback-report` y `validate-supplier-rep` **no se retiran** en este
tramo: se conservan endurecidos para consumidores antiguos. Las rutas nuevas de
la aplicación (`src/lib/feedbackAi.functions.ts` y
`src/lib/supplierRep.functions.ts`) son las preferidas para cualquier trabajo
nuevo.
