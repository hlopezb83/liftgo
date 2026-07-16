# Fix: "Invalid key" al subir XML de proveedor en /suppliers

## Causa raíz

En `src/hooks/useDocuments.ts` (línea 25) el path de Storage se construye concatenando `file.name` sin sanitizar:

```ts
const filePath = `${entityType}/${entityId}/${Date.now()}_${file.name}`;
```

Supabase Storage rechaza claves con caracteres fuera del set `[a-zA-Z0-9!\-_.*'()/]` con error `Invalid key`. Los XML CFDI de proveedores mexicanos suelen traer:

- Espacios en blanco
- Acentos y `ñ` (ej. `Facturación Enero.xml`)
- Guiones largos, paréntesis mal cerrados, comas
- Prefijos con `&` o `#` de sistemas contables

El error reportado (`supplier/4397e210-.../178…`) corresponde exactamente a este hook — es el único que usa el prefijo `supplier/` (via `entityType="supplier"`) y el único de la app que sube archivos genéricos sin sanitizar. El hook hermano `useUploadSupplierBillXml` ya sanitiza con `.replace(/[^a-zA-Z0-9._-]/g, "_")`.

## Cambio

Aplicar la misma sanitización canónica que ya usan `useUploadSupplierBillXml` y `useUploadSupplierReceipt`:

- Reemplazar `file.name` en la construcción del path por una variante saneada (`safeName`) que sólo conserve `[a-zA-Z0-9._-]`.
- Mantener el `file_name` original en la fila `documents` (para mostrarlo tal cual al usuario) — sólo el path físico se sanea.
- Colapsar guiones bajos consecutivos y recortar longitud a un máximo razonable (128 chars) para evitar paths patológicos.

Archivo:

- `src/hooks/useDocuments.ts` — `useUploadDocument.mutationFn`.

## Verificación

- Playwright: ir a `/suppliers`, abrir un proveedor, subir un XML con nombre `Factura de Prueba Enero (Ñoño).xml` y confirmar que:
  - No aparece toast "Error al subir el documento".
  - La fila queda en la tabla con `file_name` original.
  - El path en `documents.file_url` es `documents/supplier/<id>/<ts>_Factura_de_Prueba_Enero__Nono_.xml` (sin caracteres inválidos).
- Repetir con un PDF con espacios y acentos para cubrir el caso no-XML.

## Changelog

- `public/changelog.json` + `public/changelog/v7.72.9.json` — patch:
  - Título: "Sanitización de nombres de archivo al subir documentos por entidad".
  - Descripción: bug `Invalid key` en Storage cuando el XML/PDF traía acentos, espacios u otros caracteres fuera del set permitido por Supabase Storage; se aplica el mismo saneado canónico ya usado en los hooks de cuentas por pagar.

## Detalle técnico

Regex de saneado idéntica al resto del código (canónica en el repo):

```ts
const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
const filePath = `${entityType}/${entityId}/${Date.now()}_${safeName}`;
```

No se toca RLS, ni el bucket `documents`, ni la fila insertada (salvo el `file_url` que naturalmente cambia de forma). No se altera el flujo de lectura porque `openStorageFile` ya usa el path tal cual quedó guardado.

## Fuera de alcance

- No se re-migran documentos históricos con paths malformados (si los hubiera, seguirían accesibles; el problema era en `upload`, no en lectura).
- No se toca la validación de tipo/tamaño de archivo — vive fuera de este hook y no es la causa del error reportado.
