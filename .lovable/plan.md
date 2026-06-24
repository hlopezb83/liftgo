## ¿Qué es soft delete?

**Soft delete** = en lugar de borrar físicamente el registro (`DELETE FROM tabla`), se marca como inactivo con una columna (típicamente `deleted_at TIMESTAMPTZ` o `is_deleted BOOLEAN`) y se filtra en todas las lecturas (`WHERE deleted_at IS NULL`). El dato sigue en la base, recuperable, auditable y con integridad referencial intacta.

**Hard delete** = `DELETE` físico. El registro desaparece; las FKs deben tener `ON DELETE CASCADE/SET NULL` o el borrado falla.

---

## Auditoría del ERP actual

### Lo que SÍ tenemos (equivalentes funcionales)

| Mecanismo | Dónde | Qué cubre |
|---|---|---|
| **Cancelación de estado** | `invoices.cfdi_status='cancelled'`, `credit_notes`, `payment_complements`, `bookings.status='cancelled'`, `quotes.status='cancelled'`, `contracts` | Documentos fiscales y de negocio — el registro nunca se borra, se marca cancelado. Esto **ya es soft delete de facto** para todo lo fiscal/contable. |
| **Audit trail row-level** | `audit_logs` (11 tablas con diffs) | Aunque borres, queda historial del cambio anterior. Permite forense pero **no recuperación operativa**. |
| **RPC de cancelación atómica** | `refresh-cancellation-status`, `cancel-cfdi`, `cancel-credit-note`, `cancel-payment-complement` | Cierra ciclo fiscal SAT + estado interno consistente. |
| **Restricciones de borrado** | Customers, equipment_models, forklifts con bookings/facturas activas — bloqueados | Previene borrado accidental de datos referenciados. |

### Lo que hacemos HARD DELETE hoy (152 llamadas `.delete()`)

Categorías:

1. **Catálogos auxiliares** — `mechanics`, `drivers`, `equipment_models`, `supplier_contacts`, `supplier_bank_accounts`, `bank_accounts`, `maintenance_policies`, `parts_inventory`
2. **Operativo borrador** — `prospects`, `quotes` en draft, `bookings` sin movimientos, `maintenance_logs`, `deliveries`, `damage_records`
3. **Documentos** — `documents` (archivos adjuntos), `invoice_bookings` (joins)
4. **Roles/usuarios** — `user_roles`, `profiles` (vía cascade auth)
5. **Limpieza transaccional** — `supplier_bills` no aprobadas, `supplier_payments`, `credit_notes` draft

### Vacíos reales detectados

- **Forklifts borrados** → se pierde histórico de ROI/utilización aunque haya audit_logs (no permite reportes "como si todavía existiera")
- **Customers borrados** → bloqueado por FK, pero si se forzara se perdería contexto histórico de facturas viejas
- **Maintenance_logs** → borrado físico permite ocultar mantenimientos hechos (riesgo de manipulación)
- **Quotes/Bookings draft** → borrado real, no aparecen en audit_logs si nunca cambiaron de estado tras crearse

---

## ¿Vale la pena implementarlo? Análisis costo/beneficio

### Por categoría

| Categoría | ¿Soft delete? | Razón |
|---|---|---|
| **Documentos fiscales** (invoices, credit_notes, payment_complements) | **YA ES SOFT** vía status `cancelled` | No tocar. SAT exige no perder UUIDs timbrados. |
| **Bookings, contracts, quotes** | **YA ES SOFT** vía status | No tocar. |
| **Forklifts** | **SÍ — añadir `deleted_at`** | ROI histórico, reportes retrospectivos, auditoría fiscal de activos depreciables. Costo bajo, beneficio alto. |
| **Customers / Suppliers** | **SÍ — añadir `deleted_at`** | Facturas históricas necesitan razón social aunque el cliente "ya no exista". CFDI 4.0 obliga a conservar datos del receptor. |
| **Maintenance_logs / Damage_records** | **SÍ — añadir `deleted_at`** | Trazabilidad. Un mecánico no debería borrar evidencia. |
| **Catálogos auxiliares** (drivers, mechanics, bank_accounts, equipment_models, maintenance_policies) | **SÍ — añadir `deleted_at`** | Reportes históricos los referencian ("mantenimiento hecho por mecánico X" aunque X ya no trabaje aquí). |
| **Prospects** | NO — hard delete OK | Datos pre-venta, sin obligación fiscal/legal. |
| **Documents (archivos)** | NO — hard delete + storage cleanup | Costo de storage real, no requieren historia. |
| **Joins (invoice_bookings, quote_assigned_forklifts)** | NO | Son relaciones; el soft delete está en las entidades padre. |
| **user_roles / profiles** | Caso aparte — desactivar usuario, no borrar | Auditoría de quién hizo qué requiere preservar perfil. |
| **Borradores nunca usados** | NO — hard delete OK | Sin valor histórico. |

### ¿Es **necesario**? — Respuesta directa

**No es crítico ni urgente.** El ERP ya cubre los riesgos fiscales más graves (CFDI, contratos, bookings) vía status de cancelación. El `audit_logs` cubre forense.

**Pero sí aporta valor medio** en 5 tablas concretas: `forklifts`, `customers`, `suppliers`, `maintenance_logs`, `damage_records`. Sin esto, borrar un forklift rompe reportes históricos de ROI; borrar un cliente bloquea (correcto) pero impide "limpiar" sin perder contexto.

**Prioridad:** P2 (después de P0 idempotencia y otros temas fiscales). No bloqueante. Implementación incremental.

---

## Mejores prácticas (si se implementa)

1. **Columna estándar:** `deleted_at TIMESTAMPTZ NULL` (no booleano — permite saber **cuándo**) + opcional `deleted_by UUID`.
2. **Índice parcial** para no degradar queries:  
   `CREATE INDEX ON tabla (campo) WHERE deleted_at IS NULL;`
3. **Vista o RLS filtra por defecto:** policy `USING (deleted_at IS NULL)` para `authenticated`; rol admin puede ver borrados con filtro explícito.
4. **UNIQUE constraints parciales:** `CREATE UNIQUE INDEX ON customers(rfc) WHERE deleted_at IS NULL;` — permite reusar el RFC tras borrado.
5. **Cascadas lógicas vía trigger o RPC**, no `ON DELETE CASCADE` (que es para hard delete).
6. **Hard delete real solo por job nocturno** tras N días (ej. 90) para cumplir GDPR/derecho al olvido si aplicara.
7. **Nunca usar soft delete para documentos fiscales** — usar status de cancelación (ya lo hacemos correctamente).
8. **UI consistente:** botón "Archivar" en lugar de "Eliminar" para tablas con soft delete; "Papelera" en admin para restaurar.
9. **Tests:** verificar que listados filtran, que UNIQUE permite reuso, que reportes históricos siguen funcionando.

---

## Recomendación final

**No implementar soft delete global.** El ROI es bajo: el ERP ya tiene los mecanismos correctos donde más importa (fiscal, contractual).

**Sí considerar (P2, cuando haya hueco)** soft delete acotado a:
- `forklifts` — preservar histórico de activos
- `customers`, `suppliers` — preservar referencia para facturas viejas + limpieza de catálogo
- `maintenance_logs`, `damage_records` — trazabilidad anti-manipulación

Esto agregaría ~5 columnas, ~10 índices parciales, ~5 ajustes RLS y refactor de ~15 mutations. Estimado: 1-2 días de trabajo.

---

## Siguiente paso

¿Procedemos con alguna de estas opciones?

1. **Solo análisis** — dejar documentado el roadmap, sin implementar.
2. **Implementar soft delete acotado** en las 5 tablas recomendadas (P2).
3. **Implementar solo `forklifts` y `customers`** — las dos de mayor valor histórico.
4. **Reforzar lo que ya existe** — endurecer flujos de cancelación / bloqueos de borrado sin agregar `deleted_at`.
