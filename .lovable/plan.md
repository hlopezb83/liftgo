# Fix: nombres de clientes "cambiados" en /invoices (traducción automática de Chrome)

## Diagnóstico

El pantallazo muestra nombres como `COMERCIO DE INDIMEX`, `HG CAUCHO`, `CRIPTOMÁTICA`, `CANDULACIÓN DE ANILLO DE MÉXICO`, `ALMACENAMIENTO DE REGISTROS`. En la base de datos los mismos registros son `INDIMEX TRADING`, `HG RUBBER`, `CRYPTOVENDING`, `RING LOCK DE MEXICO`, `LOGISTORAGE`. Es la traducción palabra-por-palabra del inglés al español.

Causa raíz: `index.html` declara `<html lang="en">`. Chrome interpreta la app como página en inglés, detecta el contraste con el resto de la UI en español y activa (o el usuario aceptó una vez) el traductor de página, que reemplaza en el DOM cualquier palabra en inglés — incluidos los nombres propios de clientes. No es un bug de datos ni de RLS: `invoices.customer_name` y `customers.name` son idénticos en Supabase.

## Cambios

### 1. `index.html`
- Cambiar `<html lang="en">` → `<html lang="es-MX">`. La app está localizada a español mexicano (core memory), así debe declararse.
- Agregar `<meta name="google" content="notranslate" />` en `<head>` para pedirle a Chrome/Google Translate que no traduzca automáticamente.

### 2. Marcar celdas con datos "no traducibles" (defensa en profundidad)

Para que aunque el usuario fuerce "Traducir esta página" los nombres propios sobrevivan, agregar `translate="no"` (equivalente a `class="notranslate"`) en los renders de identidades de negocio en la tabla de facturas:

- `src/features/invoices/pages/InvoicesPage.tsx` — celda de `customer_name` y `invoice_number` (columnas ya definidas, línea ~80 y la tarjeta móvil línea ~200).
- Mismo tratamiento en donde aparezca el nombre del cliente en tablas de alto tráfico visual: `BookingsPage`, `QuotesPage`, `CustomersPage`, `DeliveriesPage`. Un solo helper `<Untranslated>{value}</Untranslated>` en `src/components/ui/Untranslated.tsx` que renderiza `<span translate="no">` mantiene la intención explícita y evita repetir el atributo.

### 3. Verificación

- Refrescar la vista `/invoices` con el traductor de Chrome activo (usar Playwright con `--lang=es` no reproduce; validar visualmente en Chrome real). Se espera que los nombres vuelvan a mostrarse tal cual la BD.
- Confirmar que la columna sigue en español para el resto de labels (headers "Cliente", "Estado", etc.) — `translate="no"` solo aplica al contenido dinámico, no al chrome de la tabla.

### 4. Changelog

- Nueva entrada `v6.111.0` (patch) en `public/changelog.json` + detalle `v6.111.0.json`: "Corrige la traducción automática de Chrome que alteraba los nombres de clientes en listas".

## Detalles técnicos

- `translate="no"` es estándar HTML y respetado por Google Translate, Edge Translate y Safari Translate.
- No tocamos ninguna tabla ni RLS: los datos ya son correctos.
- Fuera de alcance: revisar la superficie completa de tablas para envolver todos los identificadores; se puede iterar después si se detecta el mismo patrón en otra pantalla.
