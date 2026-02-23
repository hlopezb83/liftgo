

# Agregar logo a PDFs y boton de subida de imagen

## Resumen

Dos mejoras al manejo del logo de la empresa:
1. Mostrar el logo en los PDFs de facturas y contratos
2. Reemplazar el campo de texto "URL del Logo" con un boton para subir imagen directamente

## Cambios

### 1. Funcion utilitaria para cargar imagen como base64

Crear `src/lib/loadImageAsBase64.ts` con una funcion que descarga una imagen desde URL y la convierte a base64 (necesario para jsPDF `addImage`). Si falla (URL invalida, CORS, etc.), retorna `null` para que el PDF se genere sin logo.

### 2. Logo en PDF de Facturas (`src/components/InvoicePDFButton.tsx`)

- Si `company.logo_url` existe, cargar la imagen como base64 antes de generar el PDF.
- Insertar el logo en la esquina superior izquierda (aprox 20x20mm).
- Desplazar el texto del nombre de la empresa a la derecha del logo.
- Si la imagen no carga, se genera el PDF normalmente sin logo (comportamiento actual).

### 3. Logo en PDF de Contratos (`src/components/ContractPDFButton.tsx`)

- Misma logica que facturas: cargar logo y posicionarlo en el header del PDF.

### 4. Subida de imagen en Datos Fiscales (`src/pages/CompanySettingsPage.tsx`)

- Reemplazar el `Input` de URL con una seccion visual que muestre:
  - Vista previa del logo actual (si existe)
  - Boton "Subir Logo" que abre un selector de archivos (acepta imagenes: jpg, png, webp, svg)
  - Boton "Eliminar" para quitar el logo
- Al subir, el archivo se guarda en el bucket de storage `documents` bajo la ruta `company/logo_[timestamp].[ext]`
- La URL publica resultante se guarda automaticamente en `company_settings.logo_url`
- Limite de archivo: 2MB, solo imagenes

### Resultado

- Los PDFs de facturas y contratos mostraran el logo de la empresa en el encabezado
- El proceso de subir logo sera tan simple como hacer clic en un boton y seleccionar una imagen, sin necesidad de copiar URLs externas

