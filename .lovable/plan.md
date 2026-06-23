## Problema
Al importar desde CSF, el campo `name` viene con sufijo de régimen societario (ej: "LOGISTORAGE SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"). Como ahora unificamos Nombre y Razón Social en un único campo, el sufijo queda visible en el formulario y luego rompe el timbrado CFDI 4.0 (regla CFDI40145).

El sanitizador `sanitizeLegalName` ya existe en `supabase/functions/stamp-cfdi/handler.ts` y limpia el sufijo en el timbrado, pero el usuario lo ve "sucio" en la UI y al guardar el cliente queda almacenado con el sufijo.

## Cambios

### 1. Edge function `parse-csf/index.ts` — prompt
Actualizar el `systemPrompt` para que el modelo regrese `name` ya **sin** el sufijo de régimen societario y en mayúsculas sin acentos. Añadir línea explícita:
> `name`: denominación o razón social SIN el sufijo de régimen societario (omite "S.A. de C.V.", "S. de R.L. de C.V.", "SAPI de C.V.", "S.C.", "A.C.", "S.A.B. de C.V.", etc.). Devuelve en MAYÚSCULAS y sin acentos.

### 2. Defensa en el cliente — `CsfDropzone.tsx`
El prompt puede no cumplirse al 100% en todas las CSF. Añadir un helper local `sanitizeCsfName(raw)` (copia mínima de la lógica de `sanitizeLegalName`) que:
- Normaliza a mayúsculas sin acentos.
- Elimina sufijos comunes con regex (`/\s+(S\.?\s*A\.?\s*B?\.?(\s+DE\s+C\.?\s*V\.?)?|S\.?\s*DE\s*R\.?\s*L\.?(\s+DE\s+C\.?\s*V\.?)?|SAPI(\s+DE\s+C\.?\s*V\.?)?|S\.?\s*C\.?|A\.?\s*C\.?|S\.?\s*A\.?\s*P\.?\s*I\.?)\.?$/i`).
- Limpia puntuación final y espacios.

Aplicar antes del `onParsed`: `name: sanitizeCsfName(data.name || data.razon_social || "")`.

### 3. Tests
- `supabase/functions/parse-csf/index_test.ts`: el test ya mockea la respuesta del modelo, así que no requiere cambio funcional. Validar que sigue pasando con el prompt actualizado (sólo cambia el texto del prompt, no la forma de la respuesta).
- Agregar test unitario para `sanitizeCsfName` en `src/features/customers/lib/__tests__/csfSanitize.test.ts` cubriendo: "LOGISTORAGE SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE", "ACME S.A. DE C.V.", "FOO S. DE R.L. DE C.V.", "BAR SAPI DE C.V.", "Persona Física con acentos".

### 4. Changelog
Nueva entrada `v6.80.5` (patch — fix de extracción CSF).

## Fuera de alcance
- No se cambia el sanitizador en `stamp-cfdi` (sigue como segunda línea de defensa).
- No se migran clientes existentes con sufijo en `name`/`razon_social`; sólo afecta nuevas importaciones desde CSF.

## Detalles técnicos
- Archivos editados:
  - `supabase/functions/parse-csf/index.ts` (sólo `systemPrompt`).
  - `src/features/customers/components/customers/CsfDropzone.tsx` (helper + uso).
  - `src/features/customers/lib/csfSanitize.ts` (nuevo, exporta `sanitizeCsfName`).
  - `src/features/customers/lib/__tests__/csfSanitize.test.ts` (nuevo).
  - `public/changelog.json` y `public/changelog/v6.80.5.json`.
