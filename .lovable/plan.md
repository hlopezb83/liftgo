

## Ajustes al PDF de Cotizaciones — Términos a ancho completo + 4 tamaños de texto

### Cambios

**1. Términos y condiciones a ancho completo**
- Mover la caja de "TÉRMINOS, CONDICIONES Y NOTAS" debajo de los totales, ocupando todo el ancho (`pw - MARGIN * 2`)
- Layout del `drawBottomSection`: primero totales (alineados a la derecha, sin caja), luego debajo la caja de términos a todo el ancho

**2. Estandarizar a 4 tamaños de fuente**
Actualmente se usan 9 tamaños distintos (7, 7.5, 8, 9, 10, 11, 12, 14, 15). Se reducen a 4:

| Constante | Tamaño | Uso |
|-----------|--------|-----|
| `FONT_XL` | 14 | Total final, número de cotización |
| `FONT_LG` | 10 | Nombre empresa, nombre cliente, título documento |
| `FONT_MD` | 8 | Cuerpo: datos emisor/cliente, filas de tabla, subtotales |
| `FONT_SM` | 6.5 | Etiquetas (EMISOR, CLIENTE), bullets specs, footer, términos |

**3. Archivo `src/lib/quotePdfPremium.ts`**
- Definir 4 constantes de tamaño al inicio del archivo
- Actualizar todas las funciones (`drawPremiumHeader`, `drawInfoCardsAt`, `drawPremiumTable`, `drawBottomSection`, `drawFooter`) para usar solo esas 4 constantes
- Las funciones de backward-compat (`drawPremiumTotals`, `drawPremiumNotes`, `drawTermsSection`) se mantienen con sus tamaños actuales para no afectar facturas

**4. `src/lib/changelog.ts`** — Entrada v5.14.1

### Archivos modificados
- `src/lib/quotePdfPremium.ts`
- `src/lib/changelog.ts`

