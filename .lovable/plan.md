# Verificación de PR397 antes de desplegar: el gate falla

## Lo que encontré (solo lectura)
- PR397 está integrado como el merge `05b285d5c`. El único código de servidor que cambia es la función `reconcile-stamping-invoices`. Además agrega una prueba de permisos multiempresa, que no se despliega.
- El checkout actual es `2a3f1fef…`, y ese merge forma parte de su historial.
- **El problema:** la carpeta `supabase/` actual **no coincide** con PR397. La diferencia entre `05b285d5c` y el checkout actual deshace exactamente el cambio de PR397: −121/+36 líneas en `reconcile-stamping-invoices/index.ts` y la prueba de permisos se revierte. En otras palabras, el código que hay aquí es la versión anterior a PR397.
- Si despliego ahora, publicaría la versión vieja de la función, no la corrección revisada.

## Qué haré cuando lo autorices
1. **No desplegar** mientras `supabase/` no sea idéntica al commit autorizado.
2. Necesito de ti:
   - El SHA de main que contiene PR397 sin revertir, con su árbol y su CI.
   - La lista exacta de funciones a desplegar. Por el cambio, sería sólo `reconcile-stamping-invoices`.
3. Con esos datos, la verificación sería:
   - Comprobar el checkout limpio.
   - Ejecutar `git diff --quiet <SHA> -- supabase/`.
   - Revisar los hashes de la función y de sus dependencias compartidas, además de `config.toml` y del lock.
4. Si todo coincide, haría un solo despliegue oficial de esa función. Luego revisaría sólo los registros pasivos: sin invocarla, sin llamadas al proveedor fiscal, sin tocar datos, permisos, migraciones ni frontend.
5. Te entregaría el recibo del paquete. La herramienta no da la versión ni el hash remotos, así que eso no lo podré confirmar.

## Pendiente de confirmar
- Si la reversión de PR397 en el checkout actual fue intencional o es un efecto de la sincronización.
