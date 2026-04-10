

## Ajustes al encabezado del PDF — v5.14.4

### Cambios

**1. Quitar nombre de empresa al lado del logo**
- Eliminar las líneas 108-114 que renderizan `companyName` (ej. "Heren Energy") a la derecha del logo
- Eliminar la variable `textStartX` ya que solo se usaba para posicionar ese texto

**2. Logo más grande**
- Aumentar `maxH` de 16mm a 22mm y `maxW` de 24mm a 32mm
- Esto hará el logo significativamente más grande manteniendo sus proporciones originales

### Archivos modificados
- `src/lib/quotePdfPremium.ts` — función `drawPremiumHeader`
- `src/lib/changelog.ts` — entrada v5.14.4

