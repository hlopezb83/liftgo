
## Contexto

Sprint pendiente del audit report (Lote E): bump de `react-dropzone` de `^15.0.0` a `^16.0.0`, con verificación visual/funcional de los 3 componentes que la consumen.

### Superficie de consumo (auditada)

Sólo 3 archivos importan `react-dropzone`, ningún test la mockea, y todos usan la API mínima idéntica:

| Archivo | Props usadas |
|---|---|
| `src/components/forms/CsfDropzone.tsx` | `useDropzone({ onDrop, accept, maxFiles, disabled }) → { getRootProps, getInputProps, isDragActive }` |
| `src/components/forms/DragDropImageUploader.tsx` | `useDropzone({ onDrop, accept, maxFiles, multiple }) → { getRootProps, getInputProps, isDragActive }` |
| `src/features/damage/components/damage/DamageEvidenceSection.tsx` | idem |

Ninguno consume `isDragReject`, `fileRejections`, `onDropRejected`, `onDropAccepted` ni `acceptedFiles` del hook. Puntos de montaje reales para las 3 pantallas:

- **CsfDropzone** → diálogos "Nuevo cliente" (`/customers`) y "Nuevo proveedor" (`/suppliers`).
- **DragDropImageUploader** → `ReturnInspectionDialog` (returns) y `DamagePhotosSection` (detalle de un daño).
- **DamageEvidenceSection** → diálogo "Reportar Daño" (`/damages` con el CTA).

### Breaking changes documentados

- **v15.0.0** (ya instalada): `isDragReject` sólo refleja drag activo. No aplica — no la usamos.
- **v16.0.0**: no hay release notes públicas en GitHub aún (npm sí publica 16.0.0). El registro interno lo lista como major. Los tipos y superficie mínima (`useDropzone`, `getRootProps`, `getInputProps`, `isDragActive`, `onDrop`) son estables. Cualquier ruptura real la atrapamos con `tsgo` + auditoría visual.

## Cambios propuestos

1. **`package.json`** — subir `react-dropzone` de `^15.0.0` a `^16.0.0`. Ejecutar `bun add react-dropzone@^16.0.0` para actualizar lockfile.

2. **Verificación estática** (sin cambios de código a priori):
   - `tsgo` sobre los 3 archivos consumidores. Si los tipos cambiaron (por ejemplo signature de `onDrop` con `FileWithPath[]` vs `File[]`), ajustar los callbacks locales.
   - Sanity check en runtime: buscar re-exports rotos con `rg "from \"react-dropzone\"" src/`.

3. **Verificación visual con Playwright** — script único que:
   - Autentica con la sesión gestionada.
   - Abre secuencialmente `/customers` (CTA Nuevo cliente → tab con CSF), `/suppliers` (Nuevo proveedor), `/damages` (Reportar Daño), y una vista con `DragDropImageUploader` (ReturnInspection o detalle de daño).
   - Screenshots en `/tmp/browser/dropzone-v16/` de cada dropzone en estado idle + con archivo cargado (usando `page.locator('input[type=file]').setInputFiles(...)`).
   - Colecta `pageerror` y falla si ≠ 0.

4. **Prueba funcional mínima**:
   - CsfDropzone: setInputFiles con un PDF fake → verificar que se dispara `parseCsf` (aparece spinner "Extrayendo datos fiscales…").
   - DragDropImageUploader: setInputFiles con 1 PNG fake → verificar que aparece la grilla de previews con la miniatura.
   - DamageEvidenceSection: idem que el anterior, en el diálogo de reporte.

5. **Changelog**: nueva entrada `v7.56.0` (minor por bump de major upstream) en `public/changelog.json` + `public/changelog/v7.56.0.json`, listando el bump, la ausencia de cambios de código de aplicación y la verificación visual/funcional.

## Detalles técnicos

- No se toca lógica de negocio ni de subida a Storage — sólo la dependencia.
- Si `tsgo` marca un mismatch de tipos en `onDrop`, ajustar la firma del callback local (probablemente `(acceptedFiles: File[]) => void` sigue válido; si no, alinear con `FileWithPath[]` re-exportado).
- Si el consumo produce warnings/errores en runtime (por ejemplo por ESM only + Vite), tratar caso por caso; hoy Vite ya consume la v15 como ESM.

## Fuera de alcance

- Migración a `@dnd-kit` (Lote F, sprint separado).
- Cambios de UI de los dropzones (mismos textos, estilos, `capture="environment"`).
- Añadir tests unitarios de RTL para los dropzones (no existían y no forman parte del sprint).

## Rollback

Si el humo visual falla, revertir el bump a `^15.0.0` con `bun add react-dropzone@^15.0.0` y descartar la entrada del changelog. No hay migraciones ni cambios de datos.
