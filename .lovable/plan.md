
## Objetivo

Permitir registrar un Gasto Operativo subiendo el XML del CFDI (factura). El sistema lo parsea, usa IA para sugerir categoría y proveedor, y abre el formulario de gasto pre-llenado para que el usuario confirme.

## Flujo de usuario

1. En `/expenses` → botón **"Importar CFDI (XML)"** junto al actual "Registrar Gasto".
2. Diálogo "Importar CFDI": dropzone que acepta `.xml` (o múltiples archivos en V1 = uno; multi-archivo lo dejamos fuera).
3. Al soltar el XML:
   - Se sube el contenido al edge function `parse-cfdi-expense`.
   - Spinner "Analizando CFDI…".
4. Respuesta → se abre `ExpenseFormDialog` pre-llenado con:
   - `amount` = Total del CFDI
   - `expense_date` = Fecha del CFDI
   - `description` = "Factura {Folio/Serie} — {primer concepto}"
   - `supplier_id` = match por RFC del Emisor, o sugerencia de crear nuevo proveedor (con botón "Crear proveedor con datos del CFDI")
   - `category` = sugerida por IA (8 opciones del enum)
   - Badge informativo: "📄 Datos extraídos del CFDI · UUID: …"
5. Usuario revisa, edita si quiere, y guarda.

## Anti-duplicados

- Nueva columna `cfdi_uuid TEXT UNIQUE` en `operating_expenses`.
- Al subir, el edge function verifica si el UUID ya existe y devuelve `{ duplicate: true, existing_id }` → el frontend muestra toast "Este CFDI ya fue registrado" con link al gasto existente.

## Cambios

### 1. Migración DB
- `ALTER TABLE public.operating_expenses ADD COLUMN cfdi_uuid TEXT;`
- `CREATE UNIQUE INDEX operating_expenses_cfdi_uuid_key ON public.operating_expenses(cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;`

### 2. Edge function `supabase/functions/parse-cfdi-expense/index.ts`
- Verifica JWT del usuario (rol admin/administrativo).
- Recibe `{ xml: string }`.
- Parser determinístico del XML (regex / `DOMParser` vía `deno-dom`):
  - Atributos del nodo `cfdi:Comprobante`: `Total`, `Fecha`, `Folio`, `Serie`, `SubTotal`, `Moneda`.
  - `cfdi:Emisor`: `Rfc`, `Nombre`, `RegimenFiscal`.
  - `cfdi:Conceptos > cfdi:Concepto`: lista de `Descripcion`, `ClaveProdServ`.
  - `tfd:TimbreFiscalDigital`: `UUID`.
- Verifica duplicado por UUID contra `operating_expenses` con service role.
- Busca proveedor existente por `rfc` (case-insensitive).
- Llama a **Lovable AI** (`google/gemini-3-flash-preview`) con tool calling para clasificar la categoría:
  - Input: lista de descripciones de conceptos + nombre/régimen del emisor.
  - Tool `classify_expense` con enum: `renta | nomina | software | depreciacion | otro | costo_venta | caja_chica | publicidad`.
- Devuelve:
  ```json
  {
    "cfdi_uuid": "…",
    "folio": "A-123",
    "total": 11600.00,
    "moneda": "MXN",
    "fecha": "2026-05-30",
    "emisor": { "rfc": "XAXX010101000", "nombre": "…", "regimen_fiscal": "…" },
    "conceptos_resumen": "Renta de oficina mayo 2026",
    "categoria_sugerida": "renta",
    "supplier_match": { "id": "uuid", "name": "…" } | null,
    "duplicate": false
  }
  ```
- Manejo de errores 429/402 de Lovable AI con mensajes claros.

### 3. Frontend
- **`src/features/expenses/components/expenses/CfdiImportDialog.tsx`** (nuevo)
  - Dropzone con `react-dropzone` (ya usado en damage tracking).
  - Llama al edge function vía `supabase.functions.invoke('parse-cfdi-expense', { body: { xml } })`.
  - Si `duplicate` → toast con link al existente, cierra.
  - Si OK → cierra y abre `ExpenseFormDialog` pasando datos prefill (nueva prop opcional `prefill`).
- **`ExpenseFormDialog.tsx`**: agregar prop opcional `prefill?: CfdiPrefill`. Si existe:
  - Setear amount/date/description/category/supplier_id.
  - Mostrar badge "📄 Pre-llenado desde CFDI · UUID: {uuid}" arriba del form.
  - Al guardar, incluir `cfdi_uuid` en el insert.
  - Si `supplier_match` es null pero hay emisor, mostrar mini-aviso "Proveedor {Nombre RFC} no existe" con botón "Crear proveedor" que abre `SupplierFormDialog` pre-llenado.
- **`useCreateExpense`**: aceptar opcional `cfdi_uuid` en payload.
- **`OperatingExpensesPage.tsx`**: agregar botón "Importar CFDI (XML)" junto al de registrar.

### 4. Permisos
- Edge function valida que el usuario sea admin o administrativo (mismo gate que tiene la tabla).

### 5. Changelog
- `public/changelog/v6.21.0.json` (minor — nueva funcionalidad).
- Entrada en `public/changelog.json`.

## Fuera de alcance

- Subida masiva (varios XML a la vez) — V2.
- Adjuntar el PDF/XML al gasto en Storage — V2.
- Validación contra el SAT (timbrado vigente / cancelado) — V2.
- Lectura del PDF (sólo XML por ahora).

## Detalles técnicos

```text
Parseo XML CFDI 4.0 (namespaces típicos):
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"

Estrategia: usar deno-dom para tolerancia a namespaces,
o regex robusto sobre atributos (suficiente para CFDI 4.0 bien formado).
Preferencia: deno-dom (npm:linkedom) para evitar falsos negativos.
```

```text
Lovable AI prompt (clasificador):
system: "Clasifica gastos operativos de una empresa de renta de montacargas
         en México en una de estas 8 categorías: renta, nomina, software,
         depreciacion, otro, costo_venta, caja_chica, publicidad.
         Usa tool calling. Si no hay señal clara, devuelve 'otro'."
user:   "Emisor: {nombre} ({regimen}). Conceptos: {lista}."
```
