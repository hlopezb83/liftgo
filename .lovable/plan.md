

## Plan: Convertir prospecto "Cerrado Ganado" en cliente (v3.18.4)

### Flujo
1. En el diálogo de edición del prospecto, cuando la etapa es "cerrado_ganado", mostrar un botón **"Convertir a Cliente"**
2. Al hacer clic, navegar a `/customers?from_prospect={id}` con los datos del prospecto como query params
3. En `CustomersPage`, detectar los query params, abrir el diálogo de nuevo cliente pre-llenado con: nombre (company_name), persona de contacto, email, teléfono
4. Al guardar el cliente exitosamente, actualizar el prospecto con un campo `customer_id` para vincularlo

### Cambios técnicos

**Migración SQL:**
- `ALTER TABLE prospects ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;`

**`ProspectFormDialog.tsx`:**
- Agregar botón "Convertir a Cliente" visible solo cuando `effectiveStage === "cerrado_ganado"` y no tiene `customer_id`
- Si ya tiene `customer_id`, mostrar badge "Cliente creado" con link
- El botón navega a `/customers?from_prospect=true&company={}&contact={}&email={}&phone={}&prospect_id={}`

**`CustomersPage.tsx`:**
- Leer `searchParams` al montar
- Si `from_prospect=true`, abrir diálogo de creación con campos pre-llenados
- Al guardar exitosamente, actualizar el prospecto con el `customer_id` resultante

**`useProspects.ts`:**
- Agregar `customer_id` al tipo `Prospect`

**`changelog.ts`** — v3.18.4

### Archivos
- **Migración**: agregar `customer_id` a `prospects`
- **Editar**: `ProspectFormDialog.tsx`, `CustomersPage.tsx`, `useProspects.ts`, `changelog.ts`

