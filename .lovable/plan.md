

## Plan: Mejorar sección de Periodo en tarjeta Detalles del PDF (v3.19.3)

### Problema
La línea `Periodo: 01/03/2025 → 30/04/2025` usa el carácter `→` que puede no renderizarse correctamente en jsPDF (fuente Helvetica no soporta todos los glyphs Unicode). Además, la presentación es plana y poco clara.

### Cambios

**`src/lib/quotePdfPremium.ts`** — `drawInfoCardsAt` (líneas 176-181)

Reemplazar la línea única de periodo por un diseño con etiquetas separadas para "Inicio" y "Fin", usando texto en negrita para las fechas y una flecha ASCII segura (`->`  o simplemente separación visual con `al`). Agregar también etiqueta "Vigencia hasta" más descriptiva.

```
DETALLES
Inicio: 01/03/2025    Fin: 30/04/2025
Vigencia hasta: 15/03/2025
```

- Usar `doc.setFont("helvetica", "bold")` para las etiquetas y `"normal"` para los valores
- Reemplazar `→` por `al` (más legible y seguro en Helvetica)
- Mantener el layout en las mismas posiciones Y existentes

**`src/lib/changelog.ts`** — v3.19.3

### Archivos
- **Editar**: `src/lib/quotePdfPremium.ts`, `src/lib/changelog.ts`

