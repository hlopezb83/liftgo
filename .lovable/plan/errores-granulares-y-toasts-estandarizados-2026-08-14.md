# Errores granulares y toasts estandarizados

## Estado actual verificado

Buena noticia: la base ya existe y no hay que reinventarla.

- `src/lib/ui/appFeedback.ts` es el único archivo de la app que importa `sonner` (además del propio `src/components/ui/sonner.tsx`). No hay toasts huérfanos: `notifyError`, `notifySuccess`, `notifyValidation`, `notifyWarning` ya concentran todo (1318 archivos revisados, 0 llamadas sueltas a `toast.*`).
- `ErrorDetailsDialog` ya existe, es global y copia el reporte al portapapeles; `notifyError` ya adjunta el botón "Ver detalles".
- `src/lib/errors/index.ts` traduce errores, pero **solo con expresiones regulares sobre el texto del mensaje**: ignora el campo `code` estructurado de PostgREST y el nombre de la restricción que viene en `details`. Solo 4 restricciones tienen mensaje propio; la base tiene 14 restricciones únicas, 71 de tipo check y 84 llaves foráneas, así que casi todo cae en el genérico "Ya existe un registro con esos datos".
- `src/features/invoices/lib/facturapiErrors.ts` cubre los códigos `CFDI40xxx`, pero **no** los códigos numéricos del SAT que mencionas (301 XML mal formado, 402 RFC no inscrito en el padrón, etc.), y cuando no reconoce el error recorta el texto a 200 caracteres, perdiendo el detalle que soporte necesita.
- `notifyError` no usa identificador de toast, así que un doble clic rápido apila dos toasts idénticos.
- Los 5 `console.error` que quedan son legítimos (telemetría, ErrorBoundary, 404, captura de pantalla) y no reemplazan feedback al usuario.

## Qué se va a construir

### 1. Catálogo de errores de base de datos

Nuevo `src/lib/errors/pgErrorCatalog.ts`:

- Resolución en tres niveles, en orden: nombre de restricción → SQLSTATE → texto libre (el comportamiento actual, como último recurso).
- Mapa de restricciones (las 14 únicas, las checks de negocio y las foráneas más visibles) a mensajes accionables en español mexicano, por ejemplo: RFC de cliente duplicado, número de serie de montacargas repetido, folio ya usado, orden de etapa de CRM ocupado.
- Mapa de SQLSTATE con copy claro: 23505 duplicado, 23503 registros relacionados, 23514 valor fuera de las reglas del negocio, 23502 falta un dato obligatorio, 22P02 formato inválido, 23P01 traslape de fechas, P0001 regla de negocio (usa el mensaje del `RAISE` porque ya viene redactado para el usuario), 42501 sin permisos, 40001/40P01 conflicto de concurrencia con sugerencia de reintentar.
- Cada resultado devuelve título, mensaje, severidad (`warning` para lo esperable, `critical` para lo inesperado) y una bandera de si hubo coincidencia.

`src/lib/errors/index.ts` y `src/lib/errors/dbErrors.ts` pasan a delegar en el catálogo, conservando su firma pública para no tocar los cientos de llamadas existentes.

### 2. Errores de FacturAPI / SAT

- Ampliar `facturapiErrors.ts` con los códigos numéricos del PAC/SAT (301 XML mal formado, 302 sello inválido, 303 certificado no corresponde al emisor, 304 certificado revocado o caducado, 305 fecha fuera de rango, 307 CFDI duplicado, 401/402 RFC no inscrito en el padrón, 404 sin folios) además de los `CFDI40xxx` ya cubiertos.
- Cada entrada devuelve: código, título corto, explicación de qué hacer y a quién le toca (cliente, contabilidad, PAC).
- Dejar de recortar a 200 caracteres el error desconocido: el mensaje del toast se resume, pero el texto completo (código, payload crudo, folio, UUID) viaja al reporte del `ErrorDetailsDialog` para que soporte lo copie íntegro.
- Nuevo helper `notifyCfdiError` que arma el reporte con contexto fiscal (folio, RFC receptor, código SAT) y llama a `notifyError`.

### 3. Higiene de toasts

- `notifyError` y `notifySuccess` aceptan una clave opcional (`dedupeKey`) que se pasa como `id` a sonner; dos disparos con la misma clave reemplazan el toast en vez de apilarlo.
- Cuando no se pasa clave, se deriva una automática del título más el mensaje, con ventana corta de supresión para el doble clic.
- Regla documentada en el encabezado del archivo y verificada por una prueba.

### 4. Pruebas

- Unitarias del catálogo: por nombre de restricción, por SQLSTATE, mensaje `RAISE` de P0001, y fallback.
- Unitarias de los códigos SAT nuevos y de que el reporte conserva el payload completo.
- Prueba de deduplicación: dos `notifyError` seguidos con el mismo contenido producen un solo toast.

## Notas técnicas

- Sin cambios en base de datos: el catálogo lee los nombres de restricción que Postgres ya devuelve en `details`/`message`.
- `extractErrorDetails` ya normaliza errores de PostgREST, Zod y `Response`; el catálogo consume esa salida en lugar de volver a parsear.
- Sin cambios de comportamiento para código que ya llama `notifyError`: solo mejora el texto mostrado.

## Changelog

Entrada minor `7.323.0` — "Errores de base de datos y SAT con mensajes accionables", en `CHANGELOG.md`, `public/changelog.json`, `public/version.json` y `package.json`.
