## Causa raíz

Las políticas RLS de `company_settings` y `billing_secrets` solo permiten `UPDATE/INSERT` al rol `admin`. Tu usuario es `administrativo`, así que el UPDATE se ejecuta pero afecta 0 filas y `.select().single()` devuelve `PGRST116` → se muestran los dos toasts ("Error" + "Cannot coerce…").

El UI actualmente pinta el formulario a cualquier rol con acceso a `/settings/operations`, dando la falsa expectativa de que puede guardar.

## Solución (solo frontend)

Restringir la pestaña **Datos Fiscales** (que incluye la carta "Configuración PAC") a `admin`. Para el resto de roles con acceso a Configuración, mostrar un aviso claro en lugar del formulario.

### Cambios

1. **`src/features/operations/components/operations/FiscalDataTab.tsx`**
   - Leer el rol efectivo con `useAuth()` (mismo hook usado en el resto de guards del proyecto).
   - Si el rol no es `admin`:
     - No montar el `<Form>` ni disparar queries de `useBillingSecrets` / `useCompanySettings` innecesariamente para escritura.
     - Renderizar un `Alert` (variante informativa, con `<Lock />` icon) que diga:
       > "Solo un administrador puede editar los datos fiscales y las llaves del PAC. Pide a un usuario con rol Admin que realice estos cambios."
   - Si el rol es `admin`, comportamiento actual sin cambios.

2. **`src/layouts/sidebar/navConfig.ts` (verificación)**
   - Confirmar que el link a Configuración sigue visible para `administrativo` (no lo ocultamos; solo bloqueamos esta pestaña puntual). Sin cambios si ya está así.

3. **Mejora colateral de robustez en `useUpsertCompanySettings` / `useUpsertBillingSecrets`** (opcional, chico):
   - Cambiar `.select().single()` a `.select('id')` + `assertRowsAffected(data, "Actualizar datos fiscales")` para que, si en el futuro RLS bloquea otra vez, el mensaje sea claro ("no se modificó ningún registro. Verifica tus permisos…") en vez del críptico `PGRST116`.
   - Sin cambios de comportamiento para el flujo admin normal.

### Changelog

- `public/changelog.json` + `public/changelog/v6.103.3.json` (patch): "Datos Fiscales y Configuración PAC ahora se muestran como solo lectura para roles distintos de admin, con aviso claro en lugar del formulario. Se mejora el mensaje de error cuando RLS bloquea una escritura."

## Fuera de alcance

- No se tocan las políticas RLS (mantienen admin-only, coherente con la sensibilidad de las llaves de Facturapi).
- No se toca el edge de timbrado ni la lógica del toggle test/producción.
