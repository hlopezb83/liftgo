# Plan: Mejorar architecture.md con todas las propuestas

Reescritura de `architecture.md` incorporando las mejoras revisadas previamente. Es un cambio de **documentación únicamente** (no toca código ni BD).

## Cambios al documento

### 1. Aclarar fuente de verdad de versionado (sección 12)
- `src/lib/changelog.ts` queda documentado como **fuente primaria** (importado por `ChangelogPage`).
- `public/changelog.json` se documenta como copia legacy/estática (si aplica) o se elimina la referencia si ya no se consume.
- Verificar antes de escribir cuál de los dos consume realmente `/changelog`.

### 2. Nueva sección "Portal de Cliente"
- Rutas bajo `/portal/*`, layout `CustomerPortalLayout`.
- Hooks aislados: `usePortalInvoices`, `usePortalBookings`, `useCustomerPortal`.
- Modelo de seguridad: RLS por `customer_id` vinculado al usuario invitado vía `useInviteCustomer` / edge function `invite-customer`.
- Acceso solo lectura.

### 3. Nueva sección "Integraciones externas"
- **Facturapi** (CFDI 4.0): edge functions `stamp-cfdi`, `cancel-cfdi`. Multi-tenant (API keys test/live por empresa).
- **Lovable AI Gateway**: usado por `generate-manual` y otras funciones que requieran modelos LLM. Sin API key del usuario.
- **CSF parsing**: `parse-csf`.

### 4. Nueva sección "Migraciones de base de datos"
- Ubicación: `supabase/migrations/` (timestamp + slug).
- Política: una migración por cambio funcional; nunca editar migraciones aplicadas; nunca tocar `auth/storage/realtime/supabase_functions/vault`.
- Validaciones temporales con triggers (no `CHECK` con `now()`).
- RPCs con `SECURITY DEFINER` y `SET search_path = public`.

### 5. Expandir sección 6 (Seguridad)
- Documentar tabla `role_permissions` (rol × módulo × `access_level`).
- Constante `MODULES` y mapa `ROUTE_TO_MODULE` en `useRolePermissions.ts`.
- Ejemplo de uso de `has_role(_user_id, _role)` en una policy real del proyecto.
- Listar las 6 roles del enum `app_role` con su intención.

### 6. Nueva sección "Reglas de negocio críticas"
- Renta calculada por **meses calendario exactos** (no 30 días fijos).
- Numeración de documentos vía RPC con prefijos en español (`FAC-`, `COT-`, `CTR-`, `RSV-`, `ENT-`, `DEV-`).
- MRR/ocupación basados estrictamente en reservas activas confirmadas hoy (la página `/mrr` es la fuente de verdad).
- Estado del montacargas se actualiza solo por eventos explícitos.
- Buffer de 3 días de mantenimiento para reservas activas (exclusión GiST).
- Subscripciones recurrentes leen `monthly_rate` al momento de generación.

### 7. Expandir sección 9 (UI/UX)
- Componentes estándar documentados: `ListPageLayout`, `SortableTableHead`, `TablePagination`, `MobileCardList`, `DetailPageHeader`, `FormPageHeader`, `EmptyState`, `StatusBadge`, `TotalsSummary`, `ReadOnlyLineItemsTable`.
- Hooks UI: `useDialogState`, `useListPage`, `useListFilters`, `useSort`, `usePagination`, `useDebouncedValue`, `useFormState`.
- Tokens compartidos de PDF en `src/lib/pdf/quote/constants.ts` reutilizados por todos los documentos para consistencia visual.
- Multimedia: `DragDropImageUploader` + `ImageGalleryLightbox` por `entityType/entityId`.
- Restauración de filtros al volver a un listado (sessionStorage).

### 8. Expandir Anti-patrones (sección 13)
Añadir:
- No usar `alert()` ni `confirm()` nativos (usar diálogos shadcn).
- No `console.log` en producción (usar `sonner` para feedback al usuario).
- No `CHECK` constraints con funciones no inmutables (`now()`, etc.) — usar triggers.
- No FK a `auth.users` (usar `profiles` y referenciar por `user_id`).
- No nested wildcards en rutas (Suspense por ruta, MainLayout estático).
- No mostrar al usuario términos como "Supabase dashboard"; usar "Lovable Cloud".

### 9. Pequeños arreglos
- Confirmar que la sección 7 menciona `appRoutes` desde `src/lib/routes-config.tsx` (ya correcto) y eliminar cualquier referencia residual a `routes.tsx` simple si quedara.
- Añadir `OperatingExpensesPage` y `MrrDetailPage` a las rutas notables si procede.
- Mencionar `getClaims` y CORS restringido en sección 6.3 con referencia explícita a `_shared/cors.ts` y `_shared/validate.ts` (ya parcialmente documentado, ampliar).

## Detalles técnicos / archivos

- **Único archivo editado**: `architecture.md` (reescritura completa preservando tono y estructura existente).
- **Changelog**: agregar entrada **patch** en `src/lib/changelog.ts` describiendo "Documentación: ampliación de architecture.md (portal, integraciones, migraciones, reglas de negocio, anti-patrones)".
- Antes de reescribir voy a verificar:
  - Cómo se consume el changelog (`ChangelogPage` lee `changelog.ts` o `changelog.json`).
  - Roles exactos en el enum (consulta rápida a la memoria/constantes).
  - Confirmar `supabase/migrations/` existe y su patrón.

## Fuera de alcance
- Cambios de código de aplicación, BD, RLS o UI.
- Renombrado de archivos.
