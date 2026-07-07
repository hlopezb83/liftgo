## Objetivo

El error `CFDI40147/DomicilioFiscalReceptor` significa que uno de los tres campos que se envían a Facturapi (RFC, razón social, CP del domicilio fiscal) no empata **exactamente** con lo que el SAT tiene en la CSF vigente del cliente. Hoy el diálogo solo muestra el mensaje traducido y un botón "Editar cliente" — el usuario no ve **qué valores está enviando la factura**, así que no sabe cuál corregir.

Refuerzo el diálogo para que, cuando el error sea `kind === "receptor_data"`, muestre:

1. Un snapshot con los 3 campos que se enviaron al SAT (RFC, razón social, CP), copiables.
2. Un checklist accionable contra la CSF.
3. El CTA existente "Editar cliente".

Sin cambios de backend ni de base de datos.

## Cambios

### 1. `useStampInvoiceFlow.ts`
Extender `StampErrorState` con los datos que se intentaron timbrar, tomados del `invoice` hidratado:

```ts
export interface StampErrorState {
  message: string;
  kind: FacturapiErrorKind;
  customerId: string | null;
  receptor?: {
    rfc: string | null;
    razonSocial: string | null;
    cp: string | null;
    regimenFiscal: string | null;
  };
}
```

Poblar `receptor` en el `onError` del `stampCfdi.mutate` leyendo de `hydrated` (los mismos campos que valida `getMissingStampFields`).

### 2. `StampErrorDialog.tsx`
Aceptar prop opcional `receptor`. Cuando `kind === "receptor_data"` y `receptor` existe, renderizar entre el `hint` y el `DialogFooter`:

- Bloque "Datos enviados al SAT" con 4 renglones (`InfoRow`-like, mono para RFC/CP):
  - RFC
  - Razón social
  - Régimen fiscal
  - Código postal
- Cada renglón con botón copiar (icono `Copy` de lucide, `navigator.clipboard.writeText`, feedback vía `notifySuccess`).
- Checklist corto (3 bullets) — literal:
  1. Pide la **CSF vigente** del cliente (no una copia vieja).
  2. Compara **RFC, razón social y CP** carácter por carácter — un acento, espacio o coma sobra/falta y el SAT rechaza.
  3. Si difiere, actualiza el cliente y **vuelve a timbrar** desde esta misma factura.

Mantener el resto del diálogo igual para los otros `kind`.

### 3. `InvoiceDetail.tsx`
Pasar `receptor={actions.stampError?.receptor}` al `<StampErrorDialog />`. Cambio mecánico de una prop.

### 4. Tests
Añadir a `src/features/invoices/components/__tests__/StampErrorDialog.test.tsx` (crear si no existe):
- Renderiza los 4 campos del receptor cuando `kind === "receptor_data"` y `receptor` presente.
- No renderiza el bloque cuando `kind !== "receptor_data"`.
- Botón copiar llama a `navigator.clipboard.writeText` con el valor esperado.

### 5. Changelog
Nueva entrada `v6.107.5` (patch, category `fix`):
- Índice en `public/changelog.json`.
- Detalle en `public/changelog/v6.107.5.json` explicando que el diálogo de error de timbrado ahora muestra los datos exactos que se enviaron al SAT para facilitar la comparación contra la CSF.

## Fuera de alcance

- No se cambia `sanitizeLegalName` ni la lógica del handler.
- No se agregan nuevos endpoints ni migraciones.
- No se toca el flujo de generación/cancelación de facturas.
