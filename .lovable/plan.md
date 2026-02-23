
# Correccion: Usuarios cliente ven informacion que no les corresponde

## Problema detectado

Cuando se invita a un cliente al portal, ocurren **dos inserciones de rol** en la tabla `user_roles`:

1. El trigger `handle_new_user` (que se ejecuta automaticamente al crear cualquier usuario en auth) inserta el rol **dispatcher** por defecto
2. La funcion `invite-customer` inserta el rol **customer**

Resultado: el usuario cliente termina con **dos roles**: `dispatcher` y `customer`. El hook `useUserRole` usa `.single()` para leer el rol, lo que falla con multiples filas y cae al valor por defecto `dispatcher`. Esto le da al cliente acceso completo al ERP interno: cotizaciones, facturas de todos los clientes, reservas, etc.

**Usuarios afectados actualmente:**
- `cliente-demo@liftgo.test` — tiene roles `{dispatcher, customer}`
- `hector@lopezbenavides.com` — tiene roles `{dispatcher, customer}`

---

## Solucion

### 1. Corregir datos existentes (migracion SQL)

Eliminar el rol `dispatcher` duplicado de los usuarios que tienen rol `customer`:

```sql
DELETE FROM user_roles
WHERE role = 'dispatcher'
  AND user_id IN (
    SELECT user_id FROM user_roles WHERE role = 'customer'
  );
```

### 2. Corregir el trigger `handle_new_user`

Modificar la funcion para que **no inserte el rol por defecto si el usuario ya tiene un rol asignado**. Esto previene la carrera entre el trigger y la funcion de invitacion.

Alternativa mas simple: que la funcion `invite-customer` **elimine el rol dispatcher** justo despues de crear el usuario, antes de insertar el rol `customer`.

Se implementara la segunda opcion porque es mas segura (no modifica el trigger que afecta a todos los usuarios).

### 3. Corregir `useUserRole` como defensa adicional

Cambiar la consulta para que, si un usuario tiene multiples roles, priorice correctamente. En vez de `.single()`, usar `.order()` con una logica que prefiera `customer` sobre `dispatcher` cuando ambos existen. O simplemente seleccionar el primer rol que no sea el default.

---

## Cambios tecnicos

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/invite-customer/index.ts` | Despues de crear el usuario, eliminar el rol `dispatcher` que inserto el trigger antes de insertar `customer` |
| `src/hooks/useUserRole.ts` | Cambiar `.single()` por una consulta que maneje multiples roles con prioridad definida |

### Migracion de base de datos

Una migracion SQL para limpiar los roles duplicados existentes.

### Logica de prioridad de roles

Si un usuario tiene multiples roles (caso anomalo), se usara esta prioridad:
1. `admin` (mayor prioridad)
2. `dispatcher`
3. `mechanic`
4. `customer`

Excepto cuando `customer` coexiste con `dispatcher` (que es el bug), en cuyo caso se asume que el usuario es cliente y se devuelve `customer`.

La solucion mas simple: tomar el **primer rol** retornado y ordenar la consulta para que `admin` > `customer` > `mechanic` > `dispatcher` (poniendo dispatcher al final como el default que es).
