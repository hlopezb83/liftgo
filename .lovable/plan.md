# Actualizar los datos fiscales de la empresa desde la CSF

Hoy, en Configuración > Datos Fiscales, el RFC, la razón social, el régimen fiscal y el lugar de expedición se capturan a mano. Clientes y proveedores ya permiten subir la Constancia de Situación Fiscal (CSF) en PDF y llenar esos campos automáticamente; la empresa emisora no.

## Qué se va a construir

- Un bloque "Importar desde CSF" arriba del formulario de Información Fiscal, visible solo para Admin (igual que el resto de la pestaña).
- Se arrastra o selecciona el PDF de la CSF, la IA extrae los datos y precarga el formulario:
  - RFC
  - Razón social
  - Régimen fiscal
  - Código postal fiscal → Lugar de expedición
- Los datos quedan cargados en el formulario, **no se guardan solos**: el usuario los revisa y presiona Guardar como siempre. Así nadie sobreescribe la configuración fiscal por accidente.
- Si un campo no viene en la CSF, se conserva el valor actual.
- Aviso visual de "datos extraídos, revisa antes de guardar".

## Detalles técnicos

- Reutiliza `CsfDropzone` (`src/components/forms/CsfDropzone.tsx`) y el hook `useParseCsf`, que llama a la edge function existente `parse-csf`. No se crean funciones ni tablas nuevas.
- Cambio acotado a `src/features/operations/components/operations/FiscalDataTab.tsx`: se agrega el dropzone con un `mapData` que traduce `ParsedCsfData` → `FiscalDataValues` y aplica `form.setValue` en cada campo no vacío (con `shouldDirty`).
- No se toca `operationsSchemas.ts`, ni `PacConfigForm`, ni las llaves del PAC.
- El PDF no se guarda en Documentos (la empresa emisora no es una entidad con expediente); solo se usa para extraer datos.

## Changelog

Nueva entrada versión menor (7.306.0) en `public/changelog/`, `public/version.json`, `CHANGELOG.md` y `package.json`.
