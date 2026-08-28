# Corrección de candados optimistas y falsos conflictos (fix-34)

Revisé los 5 archivos del diff contra el código actual: los 6 hallazgos son bugs reales y ninguno está ya corregido.

## Qué está mal hoy

1. **R6-06 — Cliente: candado optimista neutralizado.** En el detalle de cliente se envía la versión "viva" de la consulta. Si los datos se refrescan mientras el diálogo de edición está abierto, el candado se actualiza solo y el guardado pisa los cambios de otro usuario sin avisar.
2. **R6-11 — Cliente: falso "otro usuario modificó".** Cuando el guardado no afecta filas por falta de permisos, se reporta conflicto de concurrencia aunque la versión no haya cambiado. Mensaje engañoso.
3. **R6-12 — Montacargas: mismos dos problemas.** El formulario usa el `updated_at` vivo (candado neutralizado) y la comprobación de conflicto solo verifica que el registro exista, no que haya cambiado.
4. **R6-19 — Factura: candado arrastrado entre facturas.** Al navegar de editar la factura A a editar la factura B, el formulario no se remonta y conserva la versión de A: o bloquea el guardado con un conflicto falso, o deja el candado inservible.
5. **R6-13 — Factura: reintento bloqueado tras guardar.** Si el guardado funciona pero falla el paso posterior de vincular reservas, volver a presionar Guardar choca contra la propia escritura anterior y reporta conflicto falso.
6. **R6-25 — Factura inexistente o sin permisos.** Al abrir `/invoices/<id>/edit` con un id inválido queda un formulario vacío cargando para siempre, sin mensaje ni salida.

## Qué se va a hacer

- **Clientes** (`useCustomerDetailPage.ts`): tomar una foto de la versión al abrir el diálogo de edición y usar esa foto para el candado.
- **Clientes** (`useCustomers.ts`): reportar conflicto solo si la versión realmente cambió; si no, dejar que el error de permisos se muestre tal cual.
- **Montacargas** (`useForkliftMutations.ts` + `useForkliftFormLogic.ts`): comparar `updated_at` en la verificación y congelar el valor al abrir el formulario, reiniciándolo al cambiar de unidad.
- **Facturas** (`useInvoiceFormLogic.ts`): reiniciar la foto de versión cuando cambia el id de la ruta y exponer un setter para refrescarla tras un guardado exitoso; exponer también el estado de carga y el registro.
- **Facturas** (`InvoiceForm.tsx`): actualizar la foto de versión con la versión devuelta antes de sincronizar reservas, y mostrar un estado "Factura no encontrada o sin permisos" con botón para volver al listado.

## Detalles técnicos

- Los snapshots se guardan en `useRef`; en montacargas y facturas se limpian con `useEffect` sobre `id` para no arrastrar estado entre rutas.
- En clientes el `setEditOpen` envuelto se expone después de `...dialogs` para que el componente use la versión con snapshot.
- La verificación de conflicto pasa de "¿existe el registro?" a "¿cambió version / updated_at?" en clientes y montacargas.
- `EmptyState` de `@/components/feedback/EmptyState` ya soporta `title`, `subtitle`, `actionLabel` y `onAction`.
- Verificación: suite de pruebas unitarias y build; revisión visual del formulario de factura con id inválido.
- Changelog: nueva entrada **v7.369.0** (minor) en `public/changelog.json` y en el archivo MD de bitácora.
