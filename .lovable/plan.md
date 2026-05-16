# Módulo de Actividad — Vista del Dueño

## Problema actual

La página `/activity` muestra un listado plano de eventos sin responder la pregunta clave del dueño: **¿quién hizo qué?**.

- `activity_feed` no guarda el usuario que originó el evento (solo `event_type`, `entity_type`, `entity_id`, `title`, `description`).
- No hay agregaciones (totales por persona, por módulo, por día).
- Sin filtros por usuario ni rango de fechas.
- Los títulos son genéricos ("Actualización de Facturas") sin contexto del registro afectado (folio, cliente, monto).

## Objetivo

Convertir `/activity` en un **panel ejecutivo de productividad del equipo** que el dueño revise en 30 segundos:

1. Saber qué hizo cada miembro hoy / esta semana / este mes.
2. Detectar inactividad o cuellos de botella.
3. Drill-down al registro afectado con un clic.

## Cambios propuestos

### 1. Backend — enriquecer `activity_feed` con actor

Migración:

- Agregar columnas a `activity_feed`:
  - `actor_id uuid` (FK lógica a `auth.users`)
  - `actor_name text` (snapshot, sobrevive si el usuario se elimina)
  - `actor_role app_role` (snapshot)
- Modificar el trigger `log_activity()` para capturar `auth.uid()` y resolver nombre/rol desde `profiles` + `user_roles`.
- Backfill: para registros existentes, hacer JOIN con `audit_logs` por `(table_name, record_id, created_at ±2s)` y rellenar `actor_id` cuando sea posible.
- Mejorar `title`/`description` para incluir un identificador legible cuando exista en `NEW`/`OLD` (ej. `folio`, `quote_number`, `name`). Solo para las tablas con campo evidente; el resto queda con el formato actual.
- RLS: lectura solo para `admin` y `administrativo` (es vista de dirección).

### 2. Frontend — rediseño de `/activity`

Reemplazar `ActivityPage.tsx` por un layout de dashboard ejecutivo desktop-first (densidad alta, alineado con el design system):

```text
┌─────────────────────────────────────────────────────────┐
│ Actividad del Equipo                  [Hoy|7d|30d|Rango]│
├─────────────────────────────────────────────────────────┤
│ KPIs:  Acciones hoy · Usuarios activos · Pico de hora   │
│        Módulo más usado · % vs semana anterior          │
├──────────────────────────┬──────────────────────────────┤
│ Ranking por miembro      │ Acciones por módulo          │
│ (barra horizontal con    │ (barras: facturas, reservas, │
│ avatar, total, último    │  CRM, flota, mantenimiento)  │
│ visto)                   │                              │
├──────────────────────────┴──────────────────────────────┤
│ Timeline filtrable                                       │
│  [Usuario ▾] [Módulo ▾] [Acción ▾] [Buscar...]          │
│  ─ 10:42  María García (Ventas)                         │
│           Creó cotización COT-0123 — Cliente ACME       │
│  ─ 10:31  Juan Pérez (Despachador)                      │
│           Actualizó reserva RSV-0456 → "entregada"      │
│  ...      (paginado 25)                                 │
└─────────────────────────────────────────────────────────┘
```

Componentes nuevos (cada uno ≤150 LOC):

- `ActivityKPIs.tsx` — 5 tarjetas compactas con comparativa vs periodo anterior.
- `ActivityByMember.tsx` — ranking con avatar, total y "última actividad hace X".
- `ActivityByModule.tsx` — barras horizontales por `entity_type`.
- `ActivityTimeline.tsx` — lista densa zebra con actor, badge de rol, descripción y link al registro.
- `ActivityFilters.tsx` — selector de rango, usuario, módulo, acción.

Hooks:

- `useActivityFeed` extendido con filtros `{ from, to, actorId, entityType, eventType }` y paginación.
- `useActivityMetrics(range)` — agrega KPIs y rankings (una sola query con `group by`).

### 3. Navegación

- Mantener la ruta `/activity`.
- Protegerla con `RoleGuard module="activity"` (solo admin/administrativo).
- Quitar la entrada del sidebar para usuarios sin permiso.

### 4. Changelog

Añadir `public/changelog/v5.88.0.json` + entrada en `public/changelog.json`:

> **v5.88.0 — Actividad ejecutiva**: ahora cada acción registra quién la hizo. Nueva vista con KPIs, ranking del equipo y timeline filtrable por usuario, módulo y fecha.

## Fuera de alcance

- No se toca `audit_trail` (sigue siendo el detalle técnico con diffs por campo).
- No se agregan notificaciones push ni reportes por email (puede ser una iteración futura).
- No se cambia el trigger de `audit_logs`.

## Detalles técnicos

- Migración SQL idempotente; trigger `log_activity` actualizado con `SET search_path = public` y `SECURITY DEFINER`.
- `auth.uid()` puede ser `NULL` en triggers de jobs (ej. `generate-recurring-invoices`); en ese caso `actor_name = 'Sistema'`, `actor_role = NULL`.
- Backfill en una sola sentencia `UPDATE ... FROM audit_logs` con tolerancia de 2 segundos.
- KPIs cacheados con TanStack Query (`staleTime: 60s`).
- Zona horaria `America/Monterrey` para agrupaciones por día/hora (usar `nowMty()`).
- Sin `any`, sin `!`, validación con Zod en filtros.
