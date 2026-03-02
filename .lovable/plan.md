

## Agregar botón de exportar PDF en cotizaciones

### Resumen
Crear un componente `QuotePDFButton` que genere un PDF profesional de la cotización (similar al PDF de facturas) y agregarlo a la página de detalle de cotización.

### Cambios

**1. Nuevo archivo: `src/components/QuotePDFButton.tsx`**

Componente basado en el patrón existente de `InvoicePDFButton`, adaptado para cotizaciones:
- Recibe `quoteId` como prop
- Consulta la cotización y los datos de la empresa desde la base de datos
- Genera un PDF con jsPDF que incluye:
  - Logo y datos fiscales de la empresa (si existen)
  - Titulo "COTIZACION" en lugar de "FACTURA"
  - Numero de cotizacion
  - Datos del cliente
  - Periodo de renta (fecha inicio y fin)
  - Vigencia (valida hasta)
  - Tabla de partidas (descripcion, cantidad, precio unitario, total)
  - Subtotal, IVA y total
  - Notas (si existen)
- Nombre del archivo descargado: `{quote_number}.pdf`

**2. Modificar: `src/pages/QuoteDetail.tsx`**

- Importar `QuotePDFButton`
- Agregar el boton en la seccion de acciones del header, visible para todos los estados (draft, sent, accepted, declined, expired)
- Se coloca junto a los demas botones de accion

### Estructura del PDF

```text
+------------------------------------------+
| [Logo] Razon Social          COTIZACION  |
| RFC | Regimen | C.P.         COT-0001    |
+------------------------------------------+
| Cliente: Nombre              Periodo:    |
|                              Inicio-Fin  |
|                              Valida:     |
+------------------------------------------+
| Descripcion  | Cant | P.Unit | Total    |
|--------------|------|--------|----------|
| Renta mens.. |   2  | $X,XXX | $XX,XXX |
+------------------------------------------+
|                    Subtotal:  $XX,XXX.XX |
|                    IVA (16%): $X,XXX.XX  |
|                    Total:     $XX,XXX.XX |
+------------------------------------------+
| Notas: ...                               |
+------------------------------------------+
```

### Detalles tecnicos
- Se reutiliza `jsPDF` (ya instalado) y `loadImageAsBase64` (ya existente)
- Se sigue el mismo patron visual del PDF de facturas para consistencia
- No se requieren cambios en base de datos
- Todo el texto del PDF estara en espanol
