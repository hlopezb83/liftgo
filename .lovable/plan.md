# Soporte de Factura Global (Público en General)

## Problema
El SAT rechaza con `CFDI40130`: cuando el receptor es `XAXX010101000` / "PÚBLICO EN GENERAL", el CFDI debe incluir el nodo **Información Global** (Periodicidad, Meses, Año) y usar `UsoCFDI = S01`, `MétodoPago = PUE`, `FormaPago = 01`. Hoy `stamp-cfdi` no envía nada de esto.

## Alcance
Detectar automáticamente el escenario "Público en General" (RFC receptor = `XAXX010101000`) y:
1. Capturar Periodicidad / Mes / Año en el formulario de factura.
2. Forzar overrides fiscales al timbrar.
3. Enviar `global` en el payload a Facturapi.

---

## 1. Base de datos (migración)

Agregar a `public.invoices`:
- `global_periodicity text` — `'01'`(Diaria), `'02'`(Semanal), `'03'`(Quincenal), `'04'`(Mensual), `'05'`(Bimestral).
- `global_months text` — `'01'..'12'` (mensual) o `'13'..'18'` (bimestral).
- `global_year int`.

Sin default. Solo se llenan cuando aplica.

## 2. Formulario de nueva/editar factura

En `invoiceFormBuilders.ts` y schema Zod:
- Agregar campos `globalPeriodicity`, `globalMonths`, `globalYear` (opcionales).
- Precargar con: Mensual (`'04'`), mes anterior (o mes actual si es día 1), año en curso.

En el componente del formulario (sección Datos Fiscales):
- Mostrar bloque **"Factura Global"** solo cuando `receptorRfc === 'XAXX010101000'`.
- Tres selects: Periodicidad, Mes/Bimestre (opciones dependen de periodicidad), Año (rango últimos 3 años).
- Cuando el bloque es visible: forzar en UI (disabled + valor fijo + tooltip explicativo) `usoCfdi='S01'`, `metodoPago='PUE'`, `formaPago='01'`. Validación Zod refuerza los tres.

En `useInvoiceFormSubmit.ts`: mapear los tres campos nuevos al insert/update.

## 3. Edge Function `stamp-cfdi/handler.ts`

En el bloque que arma `payload` (líneas ~248-266):
- Detectar `isGlobal = (inv.receptor_rfc || '').toUpperCase() === 'XAXX010101000'`.
- Si `isGlobal`:
  - Validar que `global_periodicity`, `global_months`, `global_year` existan; si no, responder 400 con mensaje claro ("Configura Periodicidad/Mes/Año para factura global").
  - Sobrescribir en payload: `use: 'S01'`, `payment_method: 'PUE'`, `payment_form: '01'`.
  - Agregar:
    ```ts
    payload.global = {
      periodicity: inv.global_periodicity,
      months: inv.global_months,
      year: inv.global_year,
    };
    ```
  - Forzar `customer.legal_name = 'PUBLICO EN GENERAL'` y `customer.tax_system = '616'`.

## 4. Prechecks

En `src/features/invoices/lib/cfdiPrechecks.ts`: agregar regla que bloquea el timbrado si RFC es genérico y falta cualquiera de los tres campos globales, con mensaje accionable ("Abre la factura → Datos Fiscales → Factura Global").

## 5. Tests

- `handler_test.ts`: caso nuevo — receptor XAXX010101000 con campos globales → payload incluye `global` y overrides.
- `handler_test.ts`: caso — receptor XAXX010101000 sin campos globales → responde 400 sin llamar Facturapi.
- `cfdiPrechecks.test.ts`: cubre las nuevas validaciones.

## 6. Changelog

Nueva entrada `v6.104.0` (minor: nueva funcionalidad fiscal) en `public/changelog.json` + `public/changelog/v6.104.0.json`.

## Fuera de alcance
- UI para consolidar múltiples tickets en una sola factura global (hoy sigue siendo una factura por documento).
- Migración retroactiva de la factura ya en error `8195de65…`: se re-timbrará manualmente después del deploy.
