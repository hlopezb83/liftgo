

# Crear cliente desde CSF (Constancia de Situación Fiscal)

## Resumen

Agregar una opción en el diálogo de "Agregar Cliente" para subir un PDF de CSF del SAT. El sistema extraerá automáticamente los datos fiscales del documento usando IA y pre-llenará el formulario, permitiendo al usuario revisar y ajustar antes de guardar.

## Datos extraíbles del CSF

Del PDF analizado se pueden obtener:
- **RFC**: `ITR180123SP4`
- **Denominación/Razón Social**: `INDIMEX TRADING`
- **Código Postal Fiscal**: `66250`
- **Dirección**: Av. Vasconcelos 310, Oficina 6 PB, Col. Sierra Madre, San Pedro Garza García, N.L.
- **Régimen Fiscal**: `Régimen General de Ley Personas Morales` → código `601`

## Flujo de usuario

1. Usuario abre "Agregar Cliente"
2. Ve dos opciones: **"Llenar manualmente"** (actual) o **"Importar desde CSF"**
3. Si elige CSF, sube el PDF
4. El sistema envía el PDF a una función backend que usa IA para extraer los campos
5. El formulario se pre-llena con los datos extraídos
6. Usuario revisa, completa campos faltantes (email, teléfono, uso CFDI) y guarda

## Cambios técnicos

### 1. Nueva función backend: `parse-csf`
- Recibe el PDF como base64
- Usa Lovable AI (Gemini 2.5 Flash) para extraer campos estructurados del texto del PDF
- Retorna JSON con: `rfc`, `name`, `domicilio_fiscal_cp`, `address`, `regimen_fiscal` (código SAT), `representante_legal`

### 2. Modificar `CustomerFormDialog.tsx`
- Agregar un área de upload (drag-drop o botón) antes del formulario cuando `!isEdit`
- Al subir un CSF, llamar a la función backend, mostrar spinner
- Al recibir respuesta, llamar `setForm(...)` con los datos extraídos
- El usuario ve el formulario pre-llenado y puede editar cualquier campo
- Agregar un `Tabs` simple: "Manual" | "Importar CSF"

### 3. Mapeo de régimen fiscal
- La función backend mapea el texto del CSF (ej: "Régimen General de Ley Personas Morales") al código SAT correspondiente (ej: "601") usando el catálogo existente en `satCatalogs.ts`

## Archivos a modificar/crear
- `supabase/functions/parse-csf/index.ts` — nueva función backend
- `src/components/CustomerFormDialog.tsx` — agregar tab de importación con upload

