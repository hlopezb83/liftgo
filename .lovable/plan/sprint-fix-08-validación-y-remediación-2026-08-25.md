# Sprint fix-08 — Validación y remediación

Revisé el diff contra el estado real del proyecto. Tres de los cinco puntos son cambios reales y aplicables; uno ya está resuelto y no debe re-aplicarse tal cual.

## Hallazgos de la validación

| Fix | Estado verificado | Acción |
|---|---|---|
| M-17a — `supabase/seed.sql` | No existe el archivo en el repo | Crear |
| L-1 — Factura sin cliente al salir de borrador | `customer_id` y `customer_name` son nulables; hoy no hay regla que lo impida (0 filas malas actuales) | Implementar |
| L-3 — Nota de crédito huérfana si falla el timbrado | Confirmado: en `useCreateCreditNote` el timbrado se llama sin `try/catch`, el draft queda creado | Implementar |
| L-8 — XML malformado en `validate-supplier-rep` | Confirmado: el XML se decodifica y se parsea con regex sin chequeo estructural | Implementar |
| H-13 — `company_settings` legible por anónimos | **Ya resuelto.** La policy "Public read company_settings" fue eliminada en una migración previa; hoy las 7 policies son todas para `authenticated` con rol | No aplicar el diff |

## Qué se va a construir

**1. Seed de demo (M-17a)**
Archivo `supabase/seed.sql` con una fila placeholder de datos de empresa y las instrucciones para asignar el rol de administrador al primer usuario registrado. Solo se usa en entornos locales/CI; no toca la base de producción.

**2. Factura requiere cliente fuera de borrador (L-1)**
Una factura podrá guardarse como borrador sin cliente, pero al pasar a cualquier otro estado la base rechazará el cambio con un mensaje claro en español. Se aplica hacia adelante: los 105 registros actuales ya cumplen, así que no hay migración de datos.

**3. Rollback de nota de crédito (L-3)**
Si el timbrado falla justo después de crear el borrador, el borrador se elimina automáticamente para no dejar registros huérfanos ni consumir folios. El usuario ve el error de timbrado y puede reintentar.

**4. XML de complemento de pago mal formado (L-8)**
Antes de extraer datos, se valida que el XML esté estructuralmente completo. Un archivo truncado o corrupto se rechaza con error 400 explícito en vez de aceptarse con datos parciales.

**5. H-13 — sin cambios**
No se re-aplica el diff porque quitaría una policy que ya no existe y crearía una vista pública innecesaria. Sí se deja constancia en la memoria de seguridad de que `company_settings` no debe volver a exponerse a `anon`.

## Detalles técnicos

- **Migración L-1** (una sola, siguiendo las reglas SQL permanentes): `CHECK` condicional `NOT VALID` sobre `invoices` + función `enforce_invoice_customer_when_not_draft()` con `SET search_path = public` y `SECURITY INVOKER`, disparada por trigger `BEFORE INSERT OR UPDATE OF status`. El diff original omite `SET search_path` y solo cubre `UPDATE`; se corrige. Se agrega el código de error a `pgErrorCatalog.ts` para el mensaje amigable en UI.
- **L-3**: `try/catch` alrededor de `invokeEdgeFunction("stamp-credit-note", ...)` en `src/features/invoices/hooks/creditNotes/useCreditNoteMutations.ts`, con `delete().eq("id", created.id)` compensatorio y re-throw del error original. Si el borrado compensatorio también falla, se registra en consola sin ocultar el error de timbrado.
- **L-8**: helper `isWellFormedXml()` en `supabase/functions/validate-supplier-rep/index.ts`, invocado tras decodificar y antes de `extractAttr`, devolviendo 400 con `jsonError`.
- **Pruebas**: casos nuevos para el rollback de nota de crédito y para `isWellFormedXml` (XML válido, truncado, tags desbalanceados). Suite completa de Vitest + ESLint + build.
- **Changelog**: nueva entrada `v7.342.0` (minor) en `public/changelog.json` y `public/version.json`.
