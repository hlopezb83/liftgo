
## Objetivo

Actualmente no existe un `security-memory` para el proyecto. El scanner y el próximo agente están operando sin contexto, así que:

- Re-flagean cosas intencionales como si fueran bugs (p. ej. tablas de catálogos consultables por staff, `activity_feed` legible por todos los roles internos, cotizaciones que múltiples roles pueden borrar).
- No entienden que hay **dos audiencias**: staff interno (7 roles jerárquicos) y clientes externos vía `/portal/*` (rol `customer`, read-only).
- No saben qué RPCs `SECURITY DEFINER` ya fueron endurecidas y cuáles siguen siendo intencionalmente amplias.

Voy a crear `mem://security-memory.md` con el modelo de acceso real de LiftGo y lo que nunca debe pasar, sin listar findings abiertos (la guía del sistema lo prohíbe).

## Contenido propuesto para `mem://security-memory.md`

```md
# Security Memory — LiftGo ERP

LiftGo es un ERP interno para renta y mantenimiento de montacargas en México. Maneja datos financieros reales (CFDI 4.0, facturas, pagos, RFC de clientes), no es un prototipo con datos demo.

## Modelo de acceso

Dos audiencias claramente separadas:

1. **Staff interno** — 6 roles jerárquicos en `public.user_roles`, chequeados vía `public.has_role(auth.uid(), 'role')` (SECURITY DEFINER, `SET search_path = public`):
   - `admin` — acceso total, único que puede timbrar/cancelar CFDI, borrar usuarios, revertir audit trail.
   - `administrativo` — finanzas, facturación, conciliación bancaria, cancelación CFDI.
   - `auditor` — read-only en finanzas y audit trail.
   - `ventas` — CRM, cotizaciones, clientes; NO ve cuentas bancarias.
   - `dispatcher` — flota, reservas, entregas.
   - `mechanic` — mantenimiento y daños; NO ve facturas ni clientes.

2. **Clientes externos** — rol `customer`, entran por `/portal/login`, son invitados vía edge function `invite-customer`. Solo consumen RPCs `get_portal_*` (dedicadas y filtradas por `auth.uid()`). NUNCA deben tocar tablas internas ni RPCs de staff.

Toda tabla `public.*` tiene RLS habilitado. Las policies usan `has_role()` — nunca subconsultas a la misma tabla (evita recursión).

## Reglas invariantes

- **RLS es obligatoria** en cualquier tabla nueva en `public`. `CREATE TABLE` sin `GRANT` + `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` es un bug.
- **Roles NUNCA en `profiles`** ni en `auth.users`. Solo en `public.user_roles`, para evitar privilege escalation.
- **Funciones `SECURITY DEFINER` deben tener guard interno** (`has_role()` o filtro por `auth.uid()`). Si una RPC devuelve datos financieros, de otros clientes, o metadata operativa interna, debe restringir explícitamente el rol.
- **Clientes del portal NUNCA deben leer**: `invoices` completas de otros clientes, `activity_feed`, `audit_logs`, `bank_accounts`, `bank_statement_*`, `supplier_*`, `operating_expenses`, `user_roles`, `role_permissions`, `billing_secrets`, `maintenance_logs` internos, márgenes/costos.
- **Secretos sensibles** (Facturapi keys en `billing_secrets`, credenciales bancarias en `supplier_bank_accounts.clabe`) solo accesibles por `admin`/`administrativo` o `service_role`. Nunca por `anon`.
- **Edge functions destructivas o financieras** (delete-user, cancel-cfdi, cancel-credit-note, cancel-payment-complement, stamp-*, invite-user, toggle-user-status, reset-user-password) validan JWT con `auth.getClaims()` y chequean rol vía `user_roles` antes de ejecutar. CORS restringido, nunca `*` en producción.
- **jsPDF pinned ≤4.0.0** por CVE conocido; no upgrade sin verificar.
- **Password HIBP check** activo en signup y cambio de contraseña.

## Qué NO es vulnerabilidad (accepted risks / intencional)

- `activity_feed`, `audit_logs`, `status_logs` legibles por todos los roles internos (admin/administrativo/auditor/ventas/dispatcher/mechanic) — es trazabilidad compartida, no PII externa. NO restringir más.
- `equipment_models`, `maintenance_policies`, `contract_templates`, `company_settings`, `invoice_number_settings` legibles por todo staff — son catálogos operativos.
- `delete_quote_with_unassign` permite borrar cotizaciones a admin/administrativo/dispatcher/ventas (no solo admin) — coincide con RLS de `quotes`, es intencional.
- Múltiples roles pueden hacer `full` en varios módulos según `role_permissions`; la matriz vive en DB y se testea en `src/test/roleMatrix.test.ts`. No reportar como "overly permissive" sin comparar contra esa matriz.
- Nombre "Público en General" y RFC genérico `XAXX010101000` en `customers` son intencionales para CFDI 4.0 al público en general.
- URL de logo público en `company_settings.logo_url` es intencional (se muestra en PDFs y sidebar).

## Qué SÍ debe reportarse siempre

- Cualquier tabla nueva en `public` sin RLS o sin `GRANT`.
- Cualquier `SECURITY DEFINER` sin `SET search_path = public`.
- Cualquier RPC `SECURITY DEFINER` que exponga datos de un cliente/factura/pago/margen sin guard por rol o sin filtro por `auth.uid()`.
- Cualquier policy que use subconsulta recursiva a la misma tabla.
- Cualquier edge function financiera o destructiva sin `getClaims()` + chequeo de rol.
- Roles almacenados fuera de `public.user_roles`.
- CORS con `*` en funciones autenticadas.
- Secretos hardcodeados en el repo (Facturapi, service_role, DB password).
```

## Alcance

- Crear `mem://security-memory.md` con el contenido de arriba.
- No tocar código de la app ni migraciones.
- No listar findings abiertos (lo prohíben las instrucciones del sistema).

Después de crearlo, avisar al usuario para que lo revise y ajuste.
