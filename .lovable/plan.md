## Auditoría Sprint C (v7.65.0)

**Estado:** ✅ OK, sin bugs ni regresiones.

- `PageContainer` en `DeliveryDetail.tsx` y `InvoicesReconciliation.tsx` correctamente aplicado (verificado).
- No hay tests dedicados a estos wrappers de layout — son componentes puramente presentacionales sin lógica; no requieren tests unitarios (se cubren indirectamente vía E2E/Playwright de las páginas).
- `PageContainer` (43 usos), `ListPageLayout` (15 páginas de listado), `DetailPageHeader` (7/8), `FormPageHeader` (5/5) — adopción consistente.

**Deuda residual detectada** (menor, se arrastra a Sprint D como D0):
- `DatePickerField` y `DateRangePickerField` usan `DialogFooter` con `px-5 py-3` en vez del token del `FormDialog` (`-mx-6 px-6 py-3`). Inconsistencia visual en el borde inferior.

---

## Sprint D — Buttons & Modals

**Objetivo:** unificar variantes/tamaños de botón, footers de `Dialog`, y patrón de confirmación destructiva en toda la app.

### Hallazgos (auditoría rápida)

1. **`Button` sin tamaño denso.** Solo hay `default (h-10)`, `sm (h-9)`, `lg (h-11)`, `icon (h-10)`. En tablas y toolbars densas se ve mucho `className="h-8"` hardcoded → falta `xs (h-8)` y `icon-sm (h-8 w-8)`.
2. **`variant="destructive"` en 28 archivos.** Consistente en color pero no en patrón de confirmación: 29 archivos usan `useConfirm` (bien), pero conviene auditar que **toda** acción destructiva pase por `useConfirm` con `tone: "destructive"` (no botón destructivo sin confirmación previa).
3. **`DialogFooter` inconsistente.** El estándar (`FormDialog`) usa footer sticky `sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t`. `DatePickerField` y `DateRangePickerField` usan `px-5 py-3` sin sticky, sin bleed negativo. Genera 2px de diferencia visual y falta de sticky en modales largos.
4. **9 archivos importan `Dialog` primitivo directamente.** Legítimos (lightbox, command, keyboard shortcuts, error details, invite user, report damage, form-dialog interno, date pickers). Ninguno es candidato claro a migrar a `FormDialog` (no son forms RHF+Zod). Aceptable — se documenta.
5. **No hay `window.confirm` en el código productivo** (solo se menciona en el JSDoc de `ConfirmProvider` como antipatrón). ✅

### Alcance (5 tareas)

**D1. Extender `Button` con tamaños densos**
- Agregar `xs: "h-8 rounded-md px-2.5 text-xs"` y `iconSm: "h-8 w-8"` a `buttonVariants` en `src/components/ui/button.tsx`.
- Sustituir `className="h-8 …"` en botones de toolbars/tablas por `size="xs"` (barrido conservador, solo donde el intent sea claro).

**D2. Unificar `DialogFooter` denso**
- Crear helper `stickyFooterClass` o extraer una variante `<DialogFooter variant="sticky">` que aplique `sticky bottom-0 -mx-6 px-6 py-3 bg-background border-t`.
- Migrar `DatePickerField` y `DateRangePickerField` a esa variante.

**D3. Auditar acciones destructivas sin `useConfirm`**
- Barrer los 28 archivos con `variant="destructive"` y validar que cada `onClick` invoque `useConfirm({ tone: "destructive" })` antes del mutation. Marcar excepciones (ej. botón de "Cerrar sesión" dentro de un `AlertDialog` propio).
- Documentar el patrón canónico en JSDoc de `useConfirm`.

**D4. Estandarizar `Dialog` primitivos legítimos**
- Los 9 archivos que usan `Dialog` directo son casos válidos (no-form). Añadir a `mem://design/form-dialogs` una nota corta: "Modales no-form usan `Dialog` primitivo con `DialogContent` estándar; los forms usan `FormDialog`".

**D5. Changelog + verificación visual**
- Playwright: capturar screenshots de un modal (BookingForm), una toolbar con botón `size="xs"`, y una acción destructiva confirmada.
- Bump a **v7.66.0** (minor: extensión pública de `buttonVariants`).

### Detalles técnicos

- `buttonVariants` con `xs` requiere revisar `[&_svg]:size-4` (los iconos siguen bien a h-8; opcional bajar a `size-3.5` solo cuando `size="xs"`, pero preferimos no complicar).
- El cambio en `DialogFooter` no rompe llamadas existentes (variantes CVA opcionales).
- Barrido de `h-8` será manual y selectivo: solo botones-de-acción, no chips ni inputs.

### Fuera de alcance

- No se rediseñan colores, radios, tipografía (Sprint E).
- No se migran los 9 `Dialog` primitivos a `FormDialog` (no aplica).
- No se tocan `AlertDialog` — solo lo usan `confirm-dialog.tsx` y su primitivo.

### Riesgo

Bajo. Los cambios en `Button` son aditivos (nueva variante). El barrido de `h-8 → size="xs"` es cosmético. `DialogFooter` solo afecta 2 componentes.

¿Arranco?
