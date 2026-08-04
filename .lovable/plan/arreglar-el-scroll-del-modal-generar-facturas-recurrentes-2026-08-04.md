# Arreglar el scroll del modal "Generar facturas recurrentes"

## Qué pasa (verificado en el navegador)

Abrí el modal en `/invoices` con datos reales y lo medí:

- El contenedor de la lista mide 450 px de alto, pero su contenido mide 1370 px.
- Ese contenedor tiene `overflow: hidden`, así que recorta ~920 px de contenido.
- El área interna que debería hacer scroll reporta `clientHeight === scrollHeight` (1370 = 1370), o sea que **no** es un contenedor con scroll: forzar `scrollTop` no mueve nada.
- El diálogo completo solo puede desplazarse 55 px, que es lo poco que el usuario percibe.

Analogía: es como poner una hoja larga dentro de un marco de foto con vidrio fijo. La hoja está ahí completa, pero el marco la recorta y no hay manera de deslizarla.

Causa: el `ScrollArea` de Radix necesita una altura definida. Al usar solo `max-h-[50vh]`, el viewport interno (`h-full`) crece al tamaño del contenido en vez de al del marco, y el scroll nunca se activa; queda solo el recorte.

## Cambios propuestos

1. `src/features/invoices/components/recurring/RecurringPreviewBody.tsx`
   - Reemplazar el `ScrollArea` con `max-h-[50vh]` por un contenedor simple con scroll nativo: `max-h-[50vh] overflow-y-auto pr-3 mt-3`. Scroll nativo funciona con altura máxima y con gesto táctil en móvil.
   - Quitar el import de `ScrollArea` si queda sin uso.

2. `src/features/invoices/components/recurring/RecurringInvoicesResultDialog.tsx`
   - Mismo patrón defectuoso (`ScrollArea className="max-h-[60vh]"`). Aplicar la misma corrección para que el resultado de la generación también se pueda recorrer.

3. Verificación con Playwright en el mismo flujo: confirmar que el contenedor de la lista queda con `scrollHeight > clientHeight` y que `scrollTop` responde, y capturar pantalla del modal desplazado.

4. Changelog: nueva entrada patch `v7.279.3` en `public/changelog.json` + `public/changelog/v7.279.3.json`, y alinear `package.json` y `public/version.json`.

## Nota técnica

No se cambia lógica de negocio ni la selección de facturas; es únicamente contenedor/CSS. El resto de los `ScrollArea` de la app usan altura fija y no están afectados.
