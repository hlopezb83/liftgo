## Lo que observé al comparar ambos modales

Los dos comparten una buena base (Dialog + Tabs "Llenar manualmente / Importar desde CSF" + secciones), pero el lenguaje visual se rompe en detalles:


| Aspecto                | Cliente (Agregar Cliente)          | Proveedor (Nuevo Proveedor)            |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| Verbo del título       | "Agregar"                          | "Nuevo"                                |
| Verbo del CTA          | "Agregar Cliente"                  | "Crear"                                |
| Encabezados de sección | Mayúsculas, `tracking-wider`, bold | Sentence-case, `font-medium`, muted    |
| Separadores            | Ninguno entre secciones            | `border-t` en cada sección             |
| Validación             | RHF + Zod inline (`FormMessage`)   | `useState` + toast en submit           |
| Placeholders           | Ejemplos realistas en cada campo   | Casi todos vacíos                      |
| Footer                 | `FormActions` suelto               | `FormActions` dentro de `DialogFooter` |
| Régimen Fiscal         | Sólo label                         | "001 — label"                          |
| Sección Notas          | "INTERNO" como sección dedicada    | Notas sin encabezado                   |
| Sección Categoría      | (no aplica)                        | Mezclada dentro de "Datos Fiscales"    |


## Sistema unificado propuesto

**Estructura visual** (la del modal de Cliente gana porque es la más alineada con el design system "industrial minimalist"):

1. **Encabezados de sección** estilo Cliente: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. Componente compartido `<SectionHeading>` movido a `src/components/forms/` para reuso.
2. **Separadores**: `border-t pt-4` entre secciones en ambos. Da ritmo y respiración.
3. **Validación con RHF + Zod en ambos**: migrar Proveedor a `useForm` con `supplierFormSchema.ts` (nombre requerido, RFC opcional con formato, días 0–365). Mensajes inline bajo cada campo con `FormMessage`.
4. **Footer**: `DialogFooter` sticky abajo (`sticky bottom-0 bg-background border-t -mx-6 px-6 py-3`) en ambos, con `FormActions` adentro. Resuelve el caso de formularios largos que hacen scroll.
5. **Header sticky**: `DialogHeader` con `sticky top-0 bg-background z-10` y el `TabsList` justo debajo, también sticky. La acción primaria siempre queda visible aunque hagas scroll.

**Microcopy y convenciones**:

6. **Título y CTA simétricos**: "Nuevo Cliente" / "Nuevo Proveedor" en el header; CTA "Agregar cliente" / "Agregar proveedor". (En edición: "Editar cliente" / "Editar proveedor", CTA "Guardar cambios").
7. **Asterisco de requerido** en un componente `<RequiredMark />` que renderiza un `*` rojo (`text-destructive`) en lugar de mezclarlo con el texto.
8. **Catálogos SAT**: mostrar siempre `code — label` (más útil al elegir) o sólo `label` (más limpio). Recomiendo `label` para reducir ruido, igual que Cliente.
9. **Placeholders ejemplares en Proveedor**: "[contacto@empresa.com](mailto:contacto@empresa.com)", "+52 81 1234 5678", "[https://proveedor.com](https://proveedor.com)", "Calle, Col., CP, Ciudad", "Lic. Juan Pérez", etc.

**Reorganización del modal de Proveedor**:

- Sección 1 — Identidad: Nombre.
- Sección 2 — Datos Fiscales (CFDI): RFC, Régimen Fiscal, (sin C.P. fiscal, salvo que decidas pedirlo).
- Sección 3 — Contacto: Persona de contacto, Correo, Teléfono, Sitio Web.
- Sección 4 — Dirección: Dirección (un input largo, igual que Cliente).
- Sección 5 — Condiciones Comerciales: Categoría + Días de crédito (la categoría va aquí, no en fiscales).
- Sección 6 — Interno: Notas.

**Reorganización del modal de Cliente** (mínima):

- Mover el bloque "Sitio Web" desde Contacto hacia el final del bloque (ya está, ok).
- Considerar mover "Representante Legal" a Datos Fiscales (es legal/fiscal, no operativo).

**Dropzone CSF unificada**:

- Mismo componente visual: borde dashed, ícono `Upload`, texto "Arrastra el PDF de la CSF o haz clic", `accept=".pdf"`, estado de loading idéntico. Hoy `CsfDropzone` y `SupplierCsfDropzone` lucen distinto. Extraer `src/components/forms/CsfDropzone.tsx` genérico con callback `onParsed(patch, file)`.

**Tabs**:

- Añadir iconos sutiles a los triggers: `<Pencil className="h-3.5 w-3.5 mr-1.5" />` para "Llenar manualmente" y `<FileText />` para "Importar desde CSF". Mantiene texto, sólo añade carácter.

## Archivos que tocaría

- `src/features/suppliers/components/suppliers/SupplierFormDialog.tsx` — migrar a RHF/Zod, sticky header/footer, microcopy.
- `src/features/suppliers/components/suppliers/SupplierFormFields.tsx` — reorganizar secciones, agregar placeholders, reusar `SectionHeading`, `<RequiredMark />`.
- `src/features/suppliers/lib/supplierFormSchema.ts` (nuevo) — Zod schema.
- `src/features/customers/components/customers/CustomerFormDialog.tsx` — sticky header/footer, mover `Sitio Web` opcional.
- `src/components/forms/SectionHeading.tsx` (mover desde `customerSections/`) y `src/components/forms/RequiredMark.tsx` (nuevo) — primitives compartidas.
- `src/components/forms/CsfDropzone.tsx` (nuevo, genérico) — reemplaza `CsfDropzone.tsx` y `SupplierCsfDropzone.tsx` con un wrapper que recibe el parser.
- Tests: añadir un `supplierFormDialog.test.tsx` que cubra validación inline.
- Changelog `v6.85.0` (minor — refactor visible).

## Antes de implementar — necesito decidir contigo

1. **Convención de verbos**: ¿prefieres "**Nuevo X / Agregar X**" (Nuevo en título, Agregar en CTA) o todo con "**Nuevo**" (título y CTA "Crear X")? Yo recomiendo opción 1: más amable.
2. **Alcance**: ¿hacemos el **refactor completo unificado** descrito arriba, o lo **divido en 2 fases** (Fase A: visual/microcopy + sticky footer; Fase B: migración del Proveedor a Zod + dropzone unificada)? Refactor completo
3. **Catálogos SAT**: ¿muestro `código — label` o sólo `label`? La mejor practica
4. **¿Quieres ver opciones visuales renderizadas** (3 direcciones de diseño lado a lado) antes de elegir, o avanzamos directo con la propuesta descrita? Avanza directo

&nbsp;