## Contexto

El ERP actual asume **una sola empresa operadora** (LiftGo / Herren Energy). La tabla `company_settings` contiene una única fila con RFC, logo, llaves de Facturapi, etc., y todas las demás tablas (35+) carecen de un campo `tenant_id`. Para que una segunda empresa (con sus propios montacargas, clientes, facturas, usuarios y CFDIs) opere en la misma instancia sin ver datos ajenos, se requiere un refactor de **multi-tenancy a nivel base de datos** con aislamiento estricto vía RLS.

## Estrategia recomendada: Multi-tenant por columna `tenant_id` + RLS

Es la opción **más rentable y mantenible** vs. instancias separadas. Los datos viven en las mismas tablas pero quedan aislados por una columna `tenant_id` que se filtra automáticamente con políticas RLS.

```text
┌─────────────────┐
│   tenants       │  ← LiftGo, Empresa B, ...
└────────┬────────┘
         │ tenant_id (FK en TODAS las tablas operativas)
    ┌────┴────────────────────────────────────┐
    ↓                                          ↓
┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ company_     │  │ forklifts│  │ bookings │  │ invoices │ ... (35+ tablas)
│ settings     │  └──────────┘  └──────────┘  └──────────┘
│ (1 fila/tenant)│
└──────────────┘
         ↑
         │ tenant_id
┌────────┴────────┐
│ user_roles      │  ← cada usuario pertenece a un tenant + rol
└─────────────────┘
```

## Plan por fases

### Fase 1 — Fundación de Tenancy (BD + Auth)

1. **Crear tabla `tenants`** (id, nombre, slug, plan, is_active, created_at).
2. **Agregar `tenant_id uuid NOT NULL`** a las 35 tablas operativas (`forklifts`, `bookings`, `customers`, `invoices`, `quotes`, `contracts`, `deliveries`, `damage_records`, `maintenance_logs`, `parts_inventory`, `payments`, `operating_expenses`, `suppliers`, `prospects`, `drivers`, `mechanics`, `equipment_models`, `maintenance_policies`, `documents`, `audit_logs`, `activity_feed`, `notifications`, `status_logs`, `collection_notes`, `collection_reminders_log`, `booking_extensions`, `quote_assigned_forklifts`, `return_inspections`, `maintenance_parts`, `contract_templates`, `user_manual`).
3. **Agregar `tenant_id` a `company_settings`** y eliminar la restricción de fila única → **una fila por tenant**.
4. **Modificar `user_roles`** para incluir `tenant_id` (un usuario puede tener roles en uno o varios tenants).
5. **Crear función `get_current_tenant_id()`** (`SECURITY DEFINER`, lee de `user_roles` el tenant del usuario actual).
6. **Migración de datos existentes**: crear tenant "LiftGo" y backfill de `tenant_id` en todas las tablas + usuarios actuales.

### Fase 2 — Aislamiento (RLS)

7. **Reescribir TODAS las políticas RLS** (≈180 políticas existentes) añadiendo el filtro `AND tenant_id = get_current_tenant_id()` a cada `USING` y `WITH CHECK`.
8. **Crear índices compuestos** `(tenant_id, <columna_de_negocio>)` en columnas clave para rendimiento.
9. **Ajustar todas las RPCs** (≈30) que hacen INSERT/UPDATE para incluir `tenant_id` automáticamente desde `get_current_tenant_id()`.
10. **Constraints únicas por tenant**: convertir índices únicos globales (`forklifts.serial_number`, `bookings.booking_number`, `invoices.invoice_number`, etc.) a `UNIQUE (tenant_id, <campo>)` para que cada empresa lleve su propia secuencia.

### Fase 3 — Generadores de folios y secuencias

11. **Folios por tenant**: las funciones `generate_invoice_number`, `generate_booking_number`, `generate_quote_number`, `generate_contract_number`, `generate_delivery_number` deben leer/incrementar el último folio **filtrado por `tenant_id`**, manteniendo prefijos en español (FAC-, COT-, CTR-, ENT-, RSV-).

### Fase 4 — Capa de aplicación (Frontend)

12. **Hook `useCurrentTenant()`** que lea el tenant activo del usuario y lo exponga vía un nuevo `TenantContext`.
13. **`useCompanySettings`** se ajusta para devolver la config del tenant activo (sin breaking change en consumidores).
14. **Selector de tenant en el header** (visible solo si el usuario pertenece a más de uno; ej. equipo de soporte).
15. **`get_public_branding(tenant_slug)`** acepta un slug opcional para mostrar el branding correcto en `/portal/login` por subdominio o ruta. Si no se especifica, devuelve un branding genérico LiftGo.
16. **Edge Functions** (`stamp-cfdi`, `cancel-cfdi`, `generate-invoice-pdf`, `generate-recurring-invoices`, `generate-recurring-maintenance`, `invite-user`, `invite-customer`) deben resolver el `tenant_id` desde el JWT y usar la llave Facturapi del tenant correcto.

### Fase 5 — Onboarding y Administración

17. **Pantalla "Super Admin" (rol nuevo `super_admin`)** para gestionar tenants: crear, suspender, asignar plan.
18. **Wizard de alta de empresa nueva**: crea `tenant`, `company_settings` inicial, primer usuario admin del tenant, plantillas base (contract_template, equipment_models seed opcional).
19. **Aislamiento de Storage**: los buckets (`forklift-images`, `damage-photos`, `signatures`, etc.) usan prefijo `{tenant_id}/...` y políticas de Storage filtran por ese prefijo.

### Fase 6 — Branding y dominio (opcional pero recomendado)

20. **Subdominios por tenant**: `liftgo.app` vs `empresab.app` (o rutas `/t/{slug}`). React Router resuelve el tenant desde la URL antes del login.
21. **Logo, colores y razón social por tenant** ya quedan resueltos vía `company_settings.tenant_id`.

## Detalles técnicos clave

- **`get_current_tenant_id()`** → `SECURITY DEFINER`, lee `user_roles.tenant_id` del `auth.uid()`. Si el usuario tiene múltiples tenants, lee de un campo `auth.users.raw_app_meta_data->>'active_tenant_id'` que se setea al hacer login o cambiar de tenant.
- **Migración masiva de RLS**: se hace con un script PL/pgSQL que itera sobre `pg_policies` y reemplaza el cuerpo, no manualmente.
- **Backfill seguro**: 1) crear columna nullable, 2) backfill con tenant "LiftGo", 3) `SET NOT NULL`, 4) reemplazar políticas, 5) drop de constraints únicas globales.
- **Cero downtime**: cada fase es retrocompatible si se aplican en orden; la app sigue funcionando porque LiftGo seguirá siendo el tenant por defecto durante la transición.

## Estimación de impacto

| Área | Esfuerzo | Riesgo |
|---|---|---|
| Migraciones BD (35 tablas + 180 policies + 30 RPCs) | **Alto** | Alto (datos productivos) |
| Refactor frontend (TenantContext, hooks) | Medio | Bajo |
| Edge Functions (Facturapi multi-llave) | Medio | Medio (CFDI es crítico) |
| Onboarding/Super Admin UI | Medio | Bajo |
| Subdominios + branding | Bajo | Bajo |
| QA y pruebas de aislamiento | **Alto** | Crítico (fuga de datos = catastrófico) |

**Tiempo estimado total: 3–5 sprints** (refactor mayor v6.0.0). Recomiendo congelar features durante el refactor.

## Alternativa descartada: Schemas separados (`tenant_a.bookings`, `tenant_b.bookings`)

Postgres soporta esquemas por tenant, pero requiere regenerar tipos de Supabase por cada tenant, cambiar el cliente JS dinámicamente y duplicar migraciones. **No recomendado** para 2–10 tenants.

## Alternativa descartada: Instancias separadas (proyecto Supabase por cliente)

Costo lineal por tenant, sin economías de escala, mantenimiento duplicado. Solo tiene sentido si un cliente exige aislamiento físico por contrato.

## Pregunta antes de proceder

¿Quieres que proceda con la **Fase 1 completa en una sola migración** (crear `tenants`, agregar `tenant_id` a todas las tablas, backfillear con LiftGo) como primer paso? Es el cimiento sin el cual ninguna otra fase funciona, y es totalmente retrocompatible: la app sigue funcionando idéntica para LiftGo mientras se construyen el resto de las fases.
