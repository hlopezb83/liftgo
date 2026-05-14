# Linealizar lógica de acceso a datos

## Objetivo
Eliminar los pocos lugares donde se hacen llamadas a Supabase dentro de `for ... await` (N round-trips secuenciales). El resto de hooks ya son lineales: una sola consulta por hook vía `useQuery` o RPCs agregadas (`get_income_statement`, `get_customer_summary`, etc.). Solo quedan 4 puntos calientes a corregir.

## Cambios

### 1. `src/hooks/useAssignForklifts.ts` — `useAssignForklift`
Hoy hace por cada asignación: `select status` → `update status='sold'` → `insert status_logs`. Para N equipos = 3N viajes.

Reemplazar por flujo lineal de 3 llamadas totales:
- `select id,status from forklifts where id in (...)` (una sola)
- `update forklifts set status='sold' where id in (...)` (una sola)
- `insert into status_logs (...)` con array de filas (una sola)
- El `insert` inicial a `quote_assigned_forklifts` se mantiene (ya es bulk)

### 2. `src/hooks/quoteDetail/useQuoteConversionActions.ts` — `createBookingsFor`
Hoy por cada assignment: `update forklifts (rates)` → `createBooking.mutateAsync` → `update bookings.quote_id`.

Plan:
- Agrupar las actualizaciones de tarifas en un solo paso: dado que cada equipo puede tener tarifas distintas, usar `upsert` con array de objetos `{id, daily_rate, weekly_rate, monthly_rate}` en una sola llamada (filtrando los campos > 0 en el cliente; los nulos se omiten con un objeto por equipo).
- Crear las reservas en paralelo con `Promise.all(assignments.map(createBooking.mutateAsync(...)))` ya que son independientes.
- Reemplazar el `update bookings.quote_id` por pasar `quote_id` directamente al insert de `bookings` dentro de `createBooking` (más limpio que un update extra). Si no es posible sin tocar el hook compartido, hacer un solo `update bookings set quote_id=... where id in (...)`.

### 3. `src/hooks/useReportDamageForm.ts`
Hoy: `for (const {file} of previews) await uploadDoc.mutateAsync(...)` — uploads secuenciales.

Plan: `await Promise.all(previews.map(({file}) => uploadDoc.mutateAsync({file, entityType:'damage_record', entityId:newRecord.id})))`. Las subidas a Storage son independientes y se benefician del paralelismo.

### 4. `supabase/functions/generate-recurring-maintenance/index.ts`
El loop `for (const policy of toGenerate)` hace `insert maintenance_logs` + `update maintenance_policies` por póliza. Es cron, no es crítico pero se beneficia.

Plan: una sola `insert` con array de logs y un solo `update maintenance_policies set last_generated_month=... where id in (...)`. Conservar el `details[]` para reporting.

## Notas técnicas
- Ninguno de los cambios altera UX visible: solo reduce latencia y evita parciales en caso de fallo a mitad del loop.
- No se introduce recursión en ningún lado (no existe hoy tampoco).
- No se tocan los hooks de lectura (`useQuery`); todos ya son una sola consulta.
- Tras los cambios: registrar entrada `5.66.3` en `public/changelog.json` + `public/changelog/v5.66.3.json` (patch, performance/refactor).

## Fuera de alcance
- Cambios de RPC en DB: solo se usan APIs existentes de PostgREST (`in()`, bulk insert/update, upsert). No se requieren migraciones.
