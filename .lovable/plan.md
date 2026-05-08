## Problema
El bloque de metadatos del side panel ("Creado por: …", "Creado: …", "Actualizado: …") muestra la misma información que ya aparece como primera entrada en la nueva tarjeta **Historial de Cambios** (Creación por X, fecha) y como última entrada (Actualización por Y, fecha).

## Solución
Eliminar el bloque redundante en `src/components/crm/ProspectDetailSheet.tsx` y dejar la tarjeta `ProspectHistoryCard` como única fuente de esta información.

### Cambios
1. **`src/components/crm/ProspectDetailSheet.tsx`**
   - Quitar el `<Separator />` + el `<div className="text-xs text-muted-foreground space-y-1">` que renderiza `created_by_name`, `created_at`, `updated_at`.
   - Mantener solo el `<Separator />` previo a `<ProspectHistoryCard prospectId={prospect.id} />`.
   - Si `date-fns`/`es` ya no se usan tras la limpieza, eliminar también esos imports.

2. **Changelog v5.65.4** (`public/changelog/v5.65.4.json` + entrada en `public/changelog.json`)
   - "CRM: eliminar metadatos duplicados en panel de prospecto (ya cubiertos por Historial de Cambios)".

## Fuera de alcance
- No se modifica el contenido ni el orden de la tarjeta `ProspectHistoryCard`.
- No se tocan otros paneles de detalle.