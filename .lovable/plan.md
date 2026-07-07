## Objetivo

Hacer que el mensaje del error CFDI40148 (`DomicilioFiscalReceptor`) apunte específicamente al **código postal**, en vez del mensaje genérico actual que menciona 4 campos posibles. Facturapi devuelve `path: "customer.address.zip"` — sabemos que el problema es exclusivamente el CP.

## Cambios

### 1. `src/features/invoices/lib/facturapiErrors.ts`

Reemplazar el patrón único de "receptor_data" por dos patrones específicos + un fallback:

- **CFDI40148 — CP no coincide** (patrón: `/CFDI40148|DomicilioFiscalReceptor|domicilio.*fiscal.*receptor/i`):
  > "El **código postal** del domicilio fiscal del cliente no coincide con el que el SAT tiene registrado para su RFC. Descarga la Constancia de Situación Fiscal (CSF) vigente del cliente y corrige el CP en su ficha — debe ser exactamente el que aparece en la sección 'Datos de Ubicación'."

- **CFDI40147 — razón social no coincide** (patrón: `/CFDI40147|NombreRazonSocialReceptor|nombre.*no coincide.*RFC|no coincide con el nombre.*RFC/i`):
  > "La **razón social** enviada no coincide con la que el SAT tiene registrada para este RFC. Verifica en la CSF del cliente el nombre exacto (sin 'S.A. de C.V.' ni acentos) y actualízalo en su ficha."

- Ambos con `kind: "receptor_data"`.
- Ordenarlos ANTES del patrón genérico de receptor para que ganen prioridad.
- Los patrones existentes (CFDI40101/40102/40103/40104 etc.) quedan igual.

### 2. `src/features/invoices/components/StampErrorDialog.tsx`

El `hint` actual para `receptor_data` dice "verifica RFC, razón social, régimen fiscal y código postal" — redundante ahora que el mensaje ya es específico. Cambio: **omitir `hint`** cuando `message` ya contiene "código postal" o "razón social" (indicador de que es uno de los mensajes específicos). Para el resto (fallback), mantener el hint genérico.

Implementación: en `getCopy`, pasar `message` como segundo parámetro opcional; si `kind === "receptor_data"` y `/código postal|razón social/i.test(message)`, devolver `hint: undefined`.

### 3. Tests

Ampliar `src/features/invoices/lib/__tests__/facturapiErrors.test.ts` (crear si no existe):

- `CFDI40148` → `kind === "receptor_data"` y `message` contiene "código postal".
- Mensaje literal `"DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC"` (el que aparece hoy) → matchea CFDI40148 y devuelve mensaje de CP.
- `CFDI40147` → `kind === "receptor_data"` y `message` contiene "razón social".
- Error CSD sigue matcheando `kind: "csd"` (regresión).

### 4. Changelog `v6.107.6`

- Índice en `public/changelog.json`.
- Detalle en `public/changelog/v6.107.6.json` (patch, category `fix`): mensaje de rechazo del SAT ahora indica el campo exacto — CFDI40148 apunta al código postal, CFDI40147 apunta a la razón social.

## Fuera de alcance

- No se toca `sanitizeLegalName` ni el handler edge.
- No se cambia el snapshot de datos enviados al SAT (ya se agregó en v6.107.5).
- No se agrega parseo del array `errors[]` estructurado — el string ya trae el código CFDI40148 suficiente para clasificar.
