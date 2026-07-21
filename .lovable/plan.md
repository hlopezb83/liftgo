## Recomendación: Sí, ejecutar el refactor

El refactor de `select("*")` a columnas explícitas en el dominio **portal** es recomendable porque es un cambio de bajo riesgo con retorno claro en seguridad y mantenimiento. No es urgente si el portal no tiene tráfico, pero es deuda técnica que conviene pagar ahora antes de que el esquema crezca.

---

## Objetivo — ¿qué ganamos?

### 1. Superficie de datos expuesta al cliente
`quotes.*` regresa **todas las columnas**, incluyendo campos internos (`rental_meta`, `assigned_by`, notas administrativas, márgenes, `line_items` completos con costos, `created_by`, etc.) que el **portal de clientes NO debería recibir aunque RLS lo permita**. Reducir el select a columnas necesarias es defensa en profundidad: aunque la RLS falle, la superficie de fuga es menor. Igual para `customer_payment_intents` (evitamos exponer `metadata`, `admin_notes`, `internal_reference`).

### 2. Payload de red y coste de render
`quotes` trae `line_items` (JSONB potencialmente grande) y `rental_meta`. En listados donde solo mostramos folio/estatus/total, ese JSONB viaja innecesariamente. Menos bytes → primer paint más rápido en móvil y menos memoria en cache de TanStack Query.

### 3. Type-safety real
Hoy `PortalQuote = Tables<"quotes">` promete 29 propiedades tipadas, pero los componentes solo usan ~8. Con columnas explícitas + `.returns<PortalQuoteRow>()`, TypeScript nos avisa si un componente intenta leer un campo que **decidimos no traer**, en vez de fallar silenciosamente en runtime cuando el backend cambie.

### 4. Estabilidad frente a cambios de esquema
Si mañana agregamos una columna sensible o un JSONB pesado a `quotes`, `select("*")` la trae automáticamente al portal. Con lista explícita, agregar columnas es opt-in.

---

## Alcance del refactor (rama única, sin tocar backend)

### Archivos a modificar
- `src/features/portal/lib/queryKeys.ts` — 3 selects (`quotes` list, `quotes` detail, `customer_payment_intents`).
- Consumers del portal que leen los tipos derivados:
  - `src/features/portal/pages/*` (PortalQuotes, PortalQuoteDetail, PortalInvoices, PortalInvoiceDetail, PortalStatement).
  - `src/features/portal/components/**` (tablas y drill-downs).
  - `src/features/portal/hooks/paymentIntents/**`.

### Estrategia
1. **Definir tipos "vista" explícitos** en `queryKeys.ts` (no `Tables<"quotes">`):
   ```ts
   export interface PortalQuoteRow {
     id: string; quote_number: string; status: string;
     valid_until: string | null; total: number; currency: string;
     tipo_cambio: number | null; customer_id: string; created_at: string;
     // + solo lo que el portal muestra
   }
   ```
2. **Reemplazar `select("*")`** por la lista literal correspondiente + `.returns<PortalQuoteRow[]>()` para preservar tipado sin explotar `tsgo` (según la nota de query-builder-type-performance).
3. **Auditar consumers** con `tsgo` y ajustar cualquier acceso a campos que ya no viajan (deberían ser cero si eliminamos solo lo interno).
4. **Detail vs list**: `detail(id)` puede traer más columnas que `list()` (p. ej. `notes` públicas, términos). Diferenciar ambos selects.

### Fuera de alcance (deuda separada)
- `select("*")` en dominios admin (`suppliers`, `customers`, `bookings`, `dashboard`, etc.) — 42 callsites restantes → otro sprint.
- Cambios en RLS o RPCs del portal.
- Nuevos endpoints o migraciones.

---

## Validación

```text
1. tsgo --noEmit         → cero errores
2. vitest run             → 1187/1187
3. Playwright portal spec → login → cotizaciones → detalle → pagar
4. Diff manual del payload en Network devtools (antes vs después)
```

## Entregable

Changelog **v7.158.0** (patch, categoría `security`/`performance`) documentando:
- Columnas expuestas antes vs después
- Reducción de payload observada (bytes)
- Tipo `PortalQuoteRow` como contrato explícito del portal

---

## Notas técnicas

- Usar el patrón `.select(sel("col1, col2, ..."))` + `.returns<T>()` de la guía "query-builder-type-performance" para no aumentar tiempos de typecheck.
- **No** tocar `defineEntityQueries` — el refactor vive dentro de cada `queryFn`.
- Mantener `PortalQuote`/`PortalPaymentIntent` como export por compatibilidad; agregar `PortalQuoteRow`/`PortalPaymentIntentRow` como los tipos que realmente devuelven las queries.
