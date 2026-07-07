## Contexto

Enviamos al PAC exactamente lo que aparece en pantalla:

- RFC: `LOG080109762`
- Razón social (post-sanitizado): `LOGISTORAGE`
- Régimen fiscal: `601`
- CP fiscal: `66367`

El SAT (modo **live**) rechaza con `CFDI40145`. Eso implica que la Constancia de Situación Fiscal (CSF) del cliente en el SAT tiene un valor distinto en al menos uno de esos campos. No podemos resolverlo desde código sin saber cuál.

## Objetivo

1. Descubrir qué campo(s) no coinciden con la CSF, sin consumir timbres.
2. Permitir corregirlos directamente en la factura/cliente para poder timbrar la NC.

## Cambios

### 1. Botón "Validar contra SAT" en el detalle de factura

En `InvoiceDetail` (junto a los botones de timbrado/NC), un botón que llama a una nueva edge function `validate-receptor-tax-info`:

- Recibe `invoice_id`.
- Llama a Facturapi `GET /v2/tools/tax_id_validation?tax_id=…&legal_name=…&tax_system=…&zip=…` (endpoint público, no consume timbre).
- Devuelve `{ is_valid, errors[] }` con el detalle campo-por-campo del rechazo del SAT.
- La UI muestra el resultado en un diálogo indicando exactamente qué corregir ("Razón social no coincide", "Régimen debe ser 603", etc.).

### 2. Diálogo "Editar datos fiscales del receptor" en la factura

Nuevo diálogo `EditReceptorFiscalDialog` accesible desde el detalle de factura (solo si `cfdi_status != 'stamped'` para la factura, siempre disponible para la NC hija). Permite editar sobre la factura:

- `receptor_razon_social`
- `receptor_regimen_fiscal` (Select con catálogo SAT)
- `receptor_domicilio_fiscal_cp`
- `receptor_rfc` (solo lectura, no se edita aquí)

Con checkbox "Guardar también en el cliente" que sincroniza los mismos campos en `customers`.

Estos son los campos que la NC ya lee (`inv.receptor_*`), así que corregirlos en la factura desbloquea el timbrado de la NC sin tocar la factura original ya timbrada.

### 3. Revertir el `retrieve` del legal_name original en `stamp-credit-note`

El intento previo de tomar el `legal_name` desde `client.invoices.retrieve(facturapi_invoice_id)` no ayuda cuando la factura fuente se timbró en test (no validado por SAT) y la NC se timbra en live. Volvemos a usar `sanitizeLegalName(inv.receptor_razon_social)` — que ahora será el valor corregido a través del diálogo del punto 2.

## Detalles técnicos

- Edge function `validate-receptor-tax-info` reutiliza `resolveFacturapiKey` y `createFacturapiClient` para obtener la API key live. El endpoint `/tools/tax_id_validation` no requiere SDK, se llama con `fetch` directo con `Authorization: Bearer <key>`.
- La respuesta esperada es `{ is_valid: boolean, errors?: Array<{ code, message, path }> }`. Se mapean los `path` a etiquetas en español para el diálogo de UI.
- El update de datos fiscales usa `useMutation` invalidando `invoiceKeys.detail(id)` y opcionalmente `customerKeys.detail`.
- Nueva entrada de changelog `v6.111.0` (minor: nueva herramienta + campos editables).

## Fuera de alcance

- Cambios en el flujo de generación de facturas nuevas (ya validan al crear/timbrar en su path).
- Auto-corregir la CSF llamando a servicios del SAT (requiere e.firma; queda para una versión posterior).
