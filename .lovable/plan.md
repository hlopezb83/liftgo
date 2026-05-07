# Breadcrumb con nombres legibles en vez de IDs

## Problema
En la barra superior se muestra `Equipos › #7e2f93` (ID truncado del UUID). Esto no le dice nada al usuario. Lo mismo ocurre en el resto de páginas de detalle: facturas, cotizaciones, clientes, contratos, etc., todas terminan en `#abcdef`.

## Solución
Resolver el último segmento del breadcrumb consultando la entidad correspondiente y mostrar un nombre humano (ej. `LIFT GO CQD15 — HPLTC015A0762/004`, `FAC-0057`, `Acme Corp`).

## Cambios

### 1. Nuevo hook `useBreadcrumbEntityLabel(pathname)`
Ubicación: `src/hooks/useBreadcrumbEntityLabel.ts`.

- Detecta si el pathname coincide con un patrón conocido (`/fleet/:id`, `/invoices/:id`, `/quotes/:id`, `/customers/:id`, `/contracts/:id`, `/bookings/:id`, `/maintenance/:id`, `/deliveries/:id`, `/returns/:id`, `/suppliers/:id`, `/expenses/:id`, `/crm/:id`, `/inventory/:id`).
- Para cada uno, ejecuta una `useQuery` ligera que obtenga el campo descriptivo (`name`, `invoice_number`, `quote_number`, `contract_number`, `booking_id`, etc.).
- Devuelve `{ label, isLoading }`.
- Comparte cache con queries existentes vía `queryKey: ["<table>", id]` cuando sea posible.

### 2. `src/components/TopbarBreadcrumbs.tsx`
- Llamar al hook con el `pathname`.
- Si el último segmento parece un ID (regex actual) y el hook devuelve `label`, usarlo en vez de `#abcdef`.
- Mientras carga: mostrar un skeleton/`…` corto en lugar de saltar el contenido.
- Mantener el truncate y la ruta clickeable como ya están.

### 3. Mapas de patrones
Definir un objeto:

```ts
const ENTITY_RESOLVERS: Record<string, { table: string; field: string }> = {
  fleet: { table: "forklifts", field: "name" },
  invoices: { table: "invoices", field: "invoice_number" },
  quotes: { table: "quotes", field: "quote_number" },
  customers: { table: "customers", field: "name" },
  contracts: { table: "contracts", field: "contract_number" },
  bookings: { table: "bookings", field: "booking_id" },
  // etc.
};
```

Verificar nombres reales en el esquema antes de implementar (pueden variar; ej. `bookings.booking_id` vs `bookings.id`).

### 4. Casos especiales
- En `/fleet/:id`: para que sea más útil, mostrar `manufacturer model` (ej. `LIFT GO CQD15`) en lugar del ID interno `name`. Esto requiere seleccionar dos columnas y concatenar.
- Si el ID no resuelve (entidad eliminada o sin permiso), caer al `#abcdef` actual.

### 5. Sin cambios en RLS ni en el resto de páginas
Las consultas usan las mismas RLS que ya están permitidas para usuarios autenticados.

### 6. Changelog
- `public/changelog/v5.59.10.json` (patch, mejora) + entrada en `public/changelog.json`.
- Título: "Breadcrumb muestra nombres legibles en vez de IDs".
