## Diagnóstico visual

En el detalle de FAC-0076 (cancelada) hay 4 botones de descarga con incoherencias:


| Botón actual      | Icono actual | Problema                                            |
| ----------------- | ------------ | --------------------------------------------------- |
| Descargar XML     | `Download`   | Icono genérico, no comunica "archivo XML"           |
| Descargar PDF SAT | `FileDown`   | Distinto del XML aun siendo el mismo tipo de acción |
| Acuse PDF         | `FileCheck`  | Mismo icono que Acuse XML → no distingue formato    |
| Acuse XML         | `FileCheck`  | Mismo icono que Acuse PDF                           |


Problemas:

1. **Formato mezclado con acción**: unos dicen "Descargar", otros no. Unos aclaran "SAT", otros no.
2. **Iconos por acción vs por formato**: `Download`/`FileDown` describen "descargar", `FileCheck` describe "acuse". No hay una regla consistente.
3. **PDF y XML del acuse son visualmente indistinguibles**.

## Propuesta (regla única)

- **El icono comunica el formato del archivo**, siempre igual sin importar si es CFDI o acuse:
  - PDF → `FileText`
  - XML → `FileCode2`
- **La etiqueta comunica qué documento es**, en 2 palabras, sin la muletilla "Descargar" (el icono ya lo implica y ahorra ancho en la barra densa):
  - `CFDI PDF` / `CFDI XML` (reemplaza "Descargar PDF SAT" y "Descargar XML")
  - `Acuse PDF` / `Acuse XML`
- **Orden consistente** en la barra: siempre PDF antes que XML, y CFDI antes que Acuse.

Resultado en una factura cancelada:

```text
[📄 CFDI PDF]  [</> CFDI XML]  [📄 Acuse PDF]  [</> Acuse XML]
```

En una factura timbrada (sin acuse) sólo aparecen las dos primeras, misma regla.

En un borrador (PDF interno, sin CFDI todavía) el botón dice `PDF borrador` con `FileText` — misma familia visual, distinto adjetivo.

## Cambios de código

Sólo capa de presentación, sin tocar lógica:

1. `src/features/invoices/components/invoices/InvoicePDFButton.tsx`
  - Cambiar `FileDown` → `FileText`.
  - Etiquetas: `PDF borrador` (draft) · `CFDI PDF` (stamped/cancelled) · `Generando…` (loading).
2. `src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`
  - Botón "Descargar XML": icono `Download` → `FileCode2`, label → `CFDI XML`.
  - `AcuseDownloadButtons`: icono `FileCheck` → `FileText` (PDF) / `FileCode2` (XML). Labels `Acuse PDF` / `Acuse XML`. Loading a `…`.
  - Ajustar el orden de render para que sea CFDI-PDF → CFDI-XML → Acuse-PDF → Acuse-XML.
3. Changelog: entrada `patch` v6.104.9 en `public/changelog.json` + `public/changelog/v6.104.9.json`.

Sin cambios en hooks, edge functions, tipos ni RLS.

Incluir lo necesario y las mismas reglas para los REP cuando se le aplique un pago a la factura. 