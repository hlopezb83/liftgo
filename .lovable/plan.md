## Mejorar redacción del error CFDI40148

El diálogo actual muestra el mensaje técnico tal cual viene de Facturapi/SAT, que es críptico para el usuario administrativo. Voy a reescribirlo en lenguaje claro y accionable.

### Cambio

En `src/features/invoices/lib/facturapiErrors.ts`, reemplazar el `message` del patrón `CFDI40148/40149`:

**Antes:**
> "El código postal fiscal del cliente no coincide con el RFC registrado en el SAT. Verifica la Constancia de Situación Fiscal (CSF) del cliente y corrige el CP fiscal, RFC o razón social."

**Después:**
> "Los datos fiscales del cliente no coinciden con los que tiene registrados el SAT. Revisa que el RFC, la razón social y el código postal del domicilio fiscal coincidan exactamente con la Constancia de Situación Fiscal (CSF) más reciente del cliente."

El diálogo (`StampErrorDialog`) ya tiene:
- Título: "Datos fiscales del receptor incorrectos"
- Hint adicional con tip operativo
- CTA: "Editar cliente"

Para reforzar la acción, también ajusto el `hint` en `StampErrorDialog.tsx` (kind `receptor_data`) a algo más directo:

> "Pide al cliente su CSF actualizada y verifica RFC, razón social, régimen fiscal y código postal. Un solo carácter diferente provoca este rechazo."

### Changelog

Publicar `v6.97.11` (patch) con título "Mejor redacción del error CFDI40148".

### Archivos a modificar

- `src/features/invoices/lib/facturapiErrors.ts` — texto del patrón receptor_data principal
- `src/features/invoices/components/StampErrorDialog.tsx` — hint del kind receptor_data
- `public/changelog.json` + `public/changelog/v6.97.11.json`
