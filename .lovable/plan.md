
# Mostrar Credenciales Temporales Despues de Crear Usuario

## Objetivo
Despues de crear un usuario exitosamente, mostrar un dialogo con las credenciales (correo y contrasena) para que el admin las copie y comparta con el nuevo usuario.

## Cambios

### 1. Modificar `invite-user` Edge Function
Actualmente la funcion NO retorna la contrasena en la respuesta. Modificar para que devuelva el `email` y `password` usados, para que el frontend los muestre.

**Archivo:** `supabase/functions/invite-user/index.ts`
- Agregar `email` y `password` al JSON de respuesta exitosa

### 2. Dialogo de Credenciales en `UserManagementPage.tsx`
Despues de crear el usuario con exito:
- Abrir un nuevo dialogo con titulo "Usuario Creado"
- Mostrar el correo y la contrasena temporal en campos de solo lectura
- Incluir botones "Copiar" junto a cada campo
- Mensaje de advertencia: "Comparte estas credenciales con el usuario. La contrasena no se podra consultar despues."
- Boton "Cerrar" para descartar

**Archivo:** `src/pages/UserManagementPage.tsx`
- Agregar estado para almacenar las credenciales recien creadas (`createdCredentials`)
- Crear un `Dialog` que se abre cuando `createdCredentials` tiene valor
- Usar `navigator.clipboard.writeText()` para la funcionalidad de copiar
- Limpiar el estado al cerrar

## Detalles Tecnicos

### Respuesta modificada del Edge Function
```text
// Antes
{ success: true, user_id: userId }

// Despues  
{ success: true, user_id: userId, email, password: finalPassword }
```

### Estado nuevo en UserManagementPage
```text
const [createdCredentials, setCreatedCredentials] = useState<{
  email: string;
  password: string;
} | null>(null);
```

### Flujo
1. Admin llena formulario y hace clic en "Crear Usuario"
2. Edge function crea el usuario y retorna email + contrasena
3. Se cierra el dialogo de creacion
4. Se abre el dialogo de credenciales con los datos
5. Admin copia las credenciales y las comparte
6. Admin cierra el dialogo

**Archivos a modificar:**
- `supabase/functions/invite-user/index.ts` -- retornar credenciales
- `src/pages/UserManagementPage.tsx` -- dialogo de credenciales

**Riesgo:** Bajo. La contrasena solo se muestra una vez en memoria del frontend y no se persiste.
