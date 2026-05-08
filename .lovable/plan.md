# Completar modelo de datos CFDI 4.0 (sobre Facturapi existente)

El sistema **ya tiene CFDI 4.0 funcionando con Facturapi** (edge functions `stamp-cfdi` / `cancel-cfdi`, UI en Datos Fiscales para capturar API keys test/live). Para empezar a timbrar facturas reales solo necesitas capturar tus API keys de Facturapi en **Datos Fiscales** y poner el modo en `live`.

Aparte de eso, hay tres huecos pequeños en el modelo de datos que conviene cerrar para soportar mejor PDF/XML descargables, mensajes de error de timbrado, y razón social separada del nombre comercial del cliente.

## Cambios propuestos

### 1. Migración a `invoices`
Agregar tres columnas opcionales:
- `cfdi_xml_url text` — URL al XML almacenado (cuando se descargue de Facturapi a Storage).
- `cfdi_pdf_url text` — URL al PDF representación impresa.
- `cfdi_error_message text` — último error devuelto por el PAC al intentar timbrar (para mostrar en UI sin abrir logs).

> Ya existe `cfdi_xml` (texto en línea); las nuevas columnas son para URLs de Storage cuando se opte por archivos descargables.

### 2. Migración a `customers`
Agregar `razon_social text` (nullable). Hoy se usa `name` como razón social cuando se timbra; separarlos permite que `name` sea el nombre comercial y `razon_social` el legal del SAT.

> `rfc`, `regimen_fiscal`, `uso_cfdi` y `domicilio_fiscal_cp` (= código postal fiscal) **ya existen**, no se duplican.

### 3. NO se crea `cfdi_configs`
Ya existe `company_settings` con: `rfc`, `razon_social`, `regimen_fiscal`, `lugar_expedicion`, `facturapi_mode`, `facturapi_test_key`, `facturapi_live_key`, RLS solo-admin para escritura. Cubre el caso 100%.

### 4. Tabla `sat_catalogs` (opcional, baja prioridad)
Hoy los catálogos SAT viven como constantes TS en `src/lib/satCatalogs.ts` (`REGIMEN_FISCAL`, `USO_CFDI`, `FORMA_PAGO`, `METODO_PAGO`, `CLAVE_PROD_SERV`, `CLAVE_UNIDAD`). Funciona bien y no requiere round-trip a DB.

**Recomendación:** **no** crear `sat_catalogs` por ahora. Solo migrar a DB si en el futuro necesitas: editar catálogos sin redeploy, búsqueda full-text en miles de claves, o exponer catálogos a clientes externos. Si confirmas que la quieres igual, la incluyo con seed básico.

### 5. UI mínima de soporte
- Mostrar `cfdi_error_message` en el panel de detalle de la factura cuando exista (badge rojo + texto).
- Campo opcional **Razón social** en el formulario de cliente (debajo de `name`), con hint "Como aparece en la Constancia de Situación Fiscal".
- Pre-llenar `receptor_razon_social` al timbrar usando `customer.razon_social ?? customer.name`.

### 6. Edge function `stamp-cfdi`
Capturar errores de Facturapi (catch en `createRes.ok === false`) y guardar el mensaje en `invoices.cfdi_error_message` además del status 502 actual. Limpiar el campo en éxito.

### 7. Changelog
Nueva entrada `v5.65.0` en `public/changelog.json` + `public/changelog/v5.65.0.json`.

## Detalles técnicos

**Migración SQL (resumen):**
```sql
ALTER TABLE public.invoices
  ADD COLUMN cfdi_xml_url text,
  ADD COLUMN cfdi_pdf_url text,
  ADD COLUMN cfdi_error_message text;

ALTER TABLE public.customers
  ADD COLUMN razon_social text;
```
Sin cambios de RLS (heredan políticas existentes). Sin índices nuevos.

**Archivos a tocar:**
- `supabase/migrations/<timestamp>_cfdi_extras.sql` (nueva)
- `supabase/functions/stamp-cfdi/index.ts` (capturar error + limpiar en éxito)
- `src/components/customers/CustomerForm.tsx` (campo razón social)
- `src/pages/InvoiceDetailPage.tsx` o panel equivalente (mostrar `cfdi_error_message`)
- `public/changelog.json` + `public/changelog/v5.65.0.json`

## Para empezar a timbrar de inmediato (sin código)
1. Ir a **Datos Fiscales → Configuración PAC**.
2. Pegar la **API Key Live** de tu cuenta Facturapi.
3. Cambiar el switch a **Live**. Listo.

## Lo que queda fuera del plan (a confirmar si lo quieres)
- Tabla `sat_catalogs` en DB (hoy en TS).
- Campos `pac_provider`/`pac_secret` (Facturapi solo usa una API key, no requiere secret).
- Reemplazar `domicilio_fiscal_cp` por `codigo_postal` (rename con riesgo, sin beneficio funcional).
