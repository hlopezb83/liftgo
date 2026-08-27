# fix-30.diff — 4 correcciones de bloqueo optimista en facturas

Revisé los cuatro hallazgos contra el código actual: los cuatro son reales y valen la pena.

## Qué se corrige

**R5-09 — La versión de la factura se "mueve" mientras editas**
Hoy la versión que se usa para el guardado seguro se lee del objeto vivo de la caché; si algo refresca la factura mientras el usuario edita, la app adopta la versión nueva y pisa los cambios de otra persona sin avisar. Se congela la versión en el momento en que la factura carga por primera vez.

**R5-16 — Guardar habilitado antes de que cargue la factura**
En edición, si el usuario alcanza a presionar Guardar antes de que termine de cargar, el UPDATE sale sin bloqueo optimista. Se deshabilita el botón con el mensaje "Cargando la factura…".

**R5-17 — Mensaje de conflicto engañoso**
Cuando el UPDATE no afecta filas, hoy siempre se dice "otro usuario modificó esta factura", incluso cuando en realidad fue falta de permisos. Se mostrará ese mensaje solo si la versión realmente cambió; si no, cae al error genérico correcto.

**R5-18 — Aviso confuso en el seed de desarrollo**
El script de datos de prueba avisa "el email no existe" incluso cuando el usuario sí existe y ya era admin. Se separan los dos casos y se limpian espacios del email.

## Detalles técnicos

- `useInvoiceFormLogic.ts`: `useRef` para congelar `existing.version` la primera vez que resuelve; exponer `invoiceVersion: invoiceVersionRef.current`.
- `InvoiceForm.tsx`: `submitDisabled={f.isEdit && f.invoiceVersion == null}` + `submitDisabledReason` (props ya soportadas por `FormActions`).
- `useInvoices.ts` (`useUpdateInvoice`): condición `still && still.version !== expectedVersion` antes de lanzar `stale_write`.
- `supabase/seed.sql`: lookup previo del usuario con `trim`, `WARNING` si no existe, `GET DIAGNOSTICS ROW_COUNT` + `NOTICE` si ya tenía el rol. Sin cambios de esquema ni migración.

## Verificación

- `bunx vitest run` (suite completa) y build.
- Changelog: nueva entrada patch `v7.359.1` con estas correcciones, más actualización del MD de changelog.
