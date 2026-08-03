# R14 — Tanda P2 post-release

Backlog no bloqueante de la auditoría R14: 1 punto ya resuelto, 6 arreglos de front-end y 1 limpieza de datos de prueba.

## Ya resuelto (verificado)

- **R14-DB-01 (OT desde daño sin "Realizado Por")**: la migración de v7.278.0 ya sella `performed_by` en `start_repair_work_order`. Sólo falta el respaldo en el camino legado del front (cuando la función de base de datos no responde), que hoy crea la orden sin mecánico.

## Qué se va a arreglar

1. **Fila vacía bloquea guardar cotización (R14-FE-01)** — Al presionar "Agregar modelo" queda una fila en blanco; hoy esa fila invalida el formulario y el guardado falla sin aviso. Se ignorarán las filas prístinas (sin modelo y sin importes) en la validación, tanto en renta como en venta, y se mostrará un aviso "Revisa los campos marcados" cuando el guardado sí sea rechazado.
2. **"Vencida" en gris (R14-FE-02)** — Pasa a rojo semántico, igual que "Vencida de pago", en todo el sistema.
3. **Kanban CRM "Negociación" morado (R14-FE-03)** — Se cambia al terracota de la paleta de marca.
4. **Customer 360 con título duplicado (R14-FE-04)** — El subtítulo repite el nombre cuando la empresa se llama igual que el contacto; se mostrará metadata (RFC · contacto) o nada.
5. **Categoría de refacción cruda (R14-FE-05)** — "refaccion" se mostrará como "Refacción" en la tabla de inventario y en el panel de detalle, vía diccionario de etiquetas.
6. **Pill "Vencida" sólida en cotizaciones (R14-FE-06)** — Las dos instancias (tabla y tarjetas móviles) usan `Badge variant="destructive"`; se migran al `StatusBadge` unificado con punto y fondo tintado.
7. **"$0" residual en detalle de cotización (R14-FE-07)** — Se buscará el render condicional con número y se corregirá para no imprimir el 0.

## Limpieza de datos

- CLABEs inválidas en el seed de cuentas bancarias de proveedores impiden probar la descarga SPEI. Se corrigen en el seed con CLABEs de 18 dígitos con dígito verificador válido (sólo datos de prueba, no producción).

## Detalles técnicos

- `src/features/quotes/lib/quoteFormSchema.ts`: en `superRefine`, filtrar líneas prístinas antes de validar (`modelId === "" && !legacyTotal && tarifas === 0` en renta; `modelId === "" && unitPrice === 0` en venta) y validar sólo el resto. `buildRentalItems`/`buildSaleItems` ya excluyen esas filas del payload.
- Toast de error: añadir handler `onInvalid` en el `handleSubmit` del QuoteForm con `notifyError`.
- `src/components/feedback/StatusBadge.tsx`: `expired: DANGER`.
- `src/index.css`: `--crm-stage-negotiating: 25 45% 48%`.
- `src/features/customers/pages/CustomerDetailPage.tsx`: `subtitle` sólo si difiere del nombre; si no, metadata.
- Nuevo mapa `PART_CATEGORY_LABELS` en `src/features/inventory/lib/` usado por `PartDetailSheet.tsx` y las columnas de inventario.
- `src/features/quotes/pages/quotesColumns.tsx:84` y `QuotesPage.tsx:128`: reemplazar `Badge variant="destructive"` por `<StatusBadge status="expired" label="Vencida" />`.
- `DamageActions.tsx`: agregar `performed_by` del usuario de sesión al payload legado de `createMaintenance.mutate`.
- Al final: entrada nueva en `public/changelog.json` + `public/changelog/v7.279.0.json` (minor).

## Verificación

Lint, typecheck, suite de pruebas, y revisión visual con navegador de: guardado de cotización con fila vacía, portal con cotización vencida, kanban CRM, Customer 360, inventario y listado móvil de cotizaciones.
