

## Plan: Corregir PDF de cotización — solapamientos, logo y agregar RFC/C.P. del cliente (v3.19.2)

### Problemas identificados

1. **Texto solapado**: El nombre de empresa (font 16) y el título "COTIZACIÓN" (font 20) compiten por espacio horizontal en el header. Con nombres largos como "HERREN ENERGY SA DE CV" se enciman.
2. **Logo**: El tamaño de 22mm puede no coincidir con el aspect ratio real de la imagen; además la posición vertical queda muy pegada al accent bar.
3. **Falta RFC y C.P. del cliente** en la tarjeta de Cliente del PDF.

### Cambios

**`src/lib/quotePdfPremium.ts`**

- **Header** (`drawPremiumHeader`): Reducir font del título a 16 (de 20), reducir font del nombre de empresa a 13 (de 16). Bajar el logo a `y` (en vez de `y-3`). Limitar ancho del nombre de empresa con `maxWidth` para evitar solapamiento.
- **Info Cards** (`drawInfoCardsAt`): Agregar parámetros `customerRfc` y `customerCp`. Mostrarlos debajo del nombre del cliente. Aumentar altura de la tarjeta de cliente de 26 a 34 para acomodar las líneas extra.

**`src/components/QuotePDFButton.tsx`**

- Fetch del cliente por `quote.customer_id` para obtener `rfc` y `domicilio_fiscal_cp`.
- Pasar estos datos a `drawInfoCardsAt`.

**`src/lib/changelog.ts`** — v3.19.2

### Archivos
- **Editar**: `src/lib/quotePdfPremium.ts`, `src/components/QuotePDFButton.tsx`, `src/lib/changelog.ts`

