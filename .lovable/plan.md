

# Mostrar quién creó cada lead en el CRM

## Problema
La tabla `prospects` no tiene un campo `created_by` para registrar qué usuario creó el prospecto.

## Solución

### 1. Migración: agregar columna `created_by`
- Agregar `created_by uuid references auth.users(id)` a la tabla `prospects`
- Crear un trigger que asigne automáticamente `auth.uid()` al insertar

### 2. Mostrar el creador en la tarjeta del Kanban
- Consultar `profiles` para obtener el nombre del creador
- En el hook `useProspects`, hacer join con `profiles` usando `created_by`
- Mostrar el nombre del creador como texto pequeño en cada tarjeta del Kanban (icono `User` + nombre)

### 3. Mostrar en el diálogo de edición
- Mostrar campo de solo lectura "Creado por" en `ProspectFormDialog` cuando se edita un prospecto existente

### Archivos a modificar
- **Migración SQL**: agregar columna `created_by` + trigger `set_created_by`
- `src/hooks/useProspects.ts`: agregar `created_by` y `created_by_name` al tipo, join con `profiles`
- `src/pages/CRMPage.tsx`: mostrar nombre del creador en las tarjetas
- `src/components/crm/ProspectFormDialog.tsx`: mostrar "Creado por" en modo edición

### Detalle técnico
```sql
ALTER TABLE public.prospects
  ADD COLUMN created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION set_prospect_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_prospect_created_by
  BEFORE INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION set_prospect_created_by();
```

En el hook, se hará un segundo query a `profiles` para resolver los nombres, similar al patrón usado en `useAuditLogs`.

