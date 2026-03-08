

## Plan: Rediseño profesional del PDF de cotización (v3.18.5)

### Problema actual
El PDF actual es básico: tipografía plana, sin jerarquía visual, sin separación clara de secciones, tabla genérica sin estilo. No transmite profesionalismo ni facilita la lectura rápida.

### Diseño propuesto

```text
┌──────────────────────────────────────────────┐
│ ▌BARRA ACCENT (navy)                         │
│                                               │
│  [Logo]  HERREN ENERGY SA DE CV               │
│          RFC: HEN200317227                    │
│                          COTIZACIÓN COT-0012  │
│                          Fecha: 08/03/2026    │
├───────────────────────────────────────────────┤
│                                               │
│  ┌─ CLIENTE ──────┐  ┌─ DETALLES ──────────┐ │
│  │ Nombre          │  │ Periodo / Vigencia  │ │
│  │ ...             │  │ ...                 │ │
│  └─────────────────┘  └─────────────────────┘ │
│                                               │
│  ┌─ CONCEPTOS ────────────────────────────┐   │
│  │ Header navy con texto blanco           │   │
│  │ Fila alterna gris claro               │   │
│  │ Fila normal                            │   │
│  │ Fila alterna gris claro               │   │
│  └────────────────────────────────────────┘   │
│                                               │
│                    Subtotal:    $XX,XXX.XX    │
│                    IVA (16%):   $X,XXX.XX     │
│                    ┌──────────────────────┐   │
│                    │ TOTAL:  $XX,XXX.XX   │   │
│                    └──────────────────────┘   │
│                                               │
│  ┌─ NOTAS ────────────────────────────────┐   │
│  │ (si aplica)                            │   │
│  └────────────────────────────────────────┘   │
│                                               │
│  ── Términos y condiciones ──                 │
│  • Precios en MXN + IVA                      │
│  • Cotización válida hasta DD/MM/YYYY         │
│                                               │
│  ─────── Pie de página con datos empresa ──── │
└───────────────────────────────────────────────┘
```

### Elementos de diseño clave
- **Barra superior navy** como acento de marca (color primario del app)
- **Encabezado** con logo más grande (30x30mm), tipografía jerárquica
- **Tarjetas info** con fondo gris claro y bordes redondeados para Cliente y Detalles
- **Tabla** con header navy/texto blanco, filas alternadas, mejor espaciado
- **Total destacado** con fondo navy y texto blanco/dorado
- **Sección de términos** automática (condiciones estándar de cotización)
- **Pie de página** con datos de contacto de la empresa
- Eliminar información redundante (régimen fiscal no es relevante en cotización)

### Cambios técnicos

**`src/lib/pdfHelpers.ts`** — Nuevas funciones de diseño:
- `drawAccentBar()` — barra superior decorativa
- `drawPremiumHeader()` — reemplaza `drawPdfHeader` con diseño mejorado
- `drawInfoCards()` — tarjetas de cliente y detalles lado a lado
- `drawPremiumTable()` — tabla con header navy, filas alternadas
- `drawPremiumTotals()` — totales con total destacado en fondo navy
- `drawTermsSection()` — términos y condiciones estándar
- `drawFooter()` — pie de página con datos de empresa
- Mantener funciones originales intactas para no romper facturas/contratos

**`src/components/QuotePDFButton.tsx`** — Usar las nuevas funciones premium

**`src/lib/changelog.ts`** — v3.18.5

### Archivos
- **Editar**: `src/lib/pdfHelpers.ts`, `src/components/QuotePDFButton.tsx`, `src/lib/changelog.ts`

