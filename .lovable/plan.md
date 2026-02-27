

# Borrar registros de la Bitacora de Cambios

## Resumen

Agregar un boton de "Eliminar" en cada registro de la bitacora (audit_logs), restringido solo al rol **Admin**. Al hacer clic, se muestra un dialogo de confirmacion antes de borrar el registro.

---

## Cambios

### 1. Politica RLS para DELETE en audit_logs

Actualmente la tabla `audit_logs` tiene una politica "Admins full access" con comando ALL, lo que ya cubre DELETE para admins. **No se necesitan cambios en la base de datos.**

### 2. Modificar hook `useAuditLogs.ts`

- Agregar una mutacion `deleteAuditLog` que ejecute `supabase.from("audit_logs").delete().eq("id", id)`
- Invalidar la query `["audit_logs"]` despues de borrar exitosamente
- Mostrar toast de confirmacion o error

### 3. Modificar `AuditTrailPage.tsx`

- Importar `useUserRole` para verificar si el usuario es admin
- Importar `AlertDialog` para el dialogo de confirmacion
- Agregar una columna extra en la tabla (solo visible para admin) con un icono de basura
- Al hacer clic en el icono, abrir un `AlertDialog` preguntando "Estas seguro de que deseas eliminar este registro de la bitacora? Esta accion no se puede deshacer."
- Al confirmar, ejecutar la mutacion de borrado
- Evitar que el clic en el boton de eliminar abra el dialogo de detalle (stopPropagation)

### 4. Changelog

- Agregar entrada v3.5.0 (o patch segun preferencia) describiendo la nueva funcionalidad

---

## Detalle tecnico

### Mutacion en useAuditLogs.ts

```text
useMutation:
  - mutationFn: (id) => supabase.from("audit_logs").delete().eq("id", id)
  - onSuccess: invalidateQueries(["audit_logs"]) + toast exito
  - onError: toast error
```

### UI en AuditTrailPage.tsx

- Nueva columna "Acciones" al final de la tabla (solo si `role === "admin"`)
- Boton con icono Trash2 en rojo, con `onClick={(e) => { e.stopPropagation(); setLogToDelete(log); }}`
- AlertDialog controlado por estado `logToDelete`
- Al confirmar: `deleteAuditLog(logToDelete.id)` y cerrar dialogo

---

## Archivos a modificar

1. `src/hooks/useAuditLogs.ts` - Agregar mutacion de borrado
2. `src/pages/AuditTrailPage.tsx` - Agregar columna y dialogo de confirmacion (solo admin)
3. `src/lib/changelog.ts` - Nueva entrada

