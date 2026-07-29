# FE-12 — Cierre de la auditoría R25 (recomendaciones de mediano plazo)

FE-12 no traía diffs: son cuatro recomendaciones. Este plan las convierte en trabajo concreto, aplicando ahora lo que aporta valor real y dejando explícitamente fuera lo que hoy no lo justifica.

## Qué se hará

### 1. Proteger identificadores de la traducción automática del navegador
El componente `Untranslated` ya existe y hoy sólo se usa en Facturas. Cuando el usuario activa "Traducir página" en Chrome, folios, nombres de clientes y series de equipo se traducen o se rompen.

Se adoptará `Untranslated` en las celdas que muestran identificadores propios en los módulos principales: Reservas (número de reserva, cliente, equipo), Cotizaciones, Contratos, Clientes, Flota (nombre y número de serie), Entregas y Cuentas por Pagar (folio y proveedor), tanto en tabla como en la tarjeta móvil.

No se hará ningún cambio de idioma ni infraestructura de i18n: la app sigue siendo sólo es-MX.

### 2. CRM deja de cargar la lista completa de cotizaciones
La pantalla de CRM pide hoy la lista completa de cotizaciones (más de 25 columnas por fila) sólo para poder mostrar el número de cotización ligada en la tarjeta del prospecto.

Se creará una consulta ligera que traiga únicamente `id` y `quote_number`, con el mismo límite de listado y caché más larga. El CRM la usará en lugar de la lista completa. Beneficio: menos datos transferidos y una pantalla de CRM que carga más rápido.

### 3. Virtualización de la conciliación bancaria
La tabla de líneas bancarias ya recibe el aviso de truncamiento y el componente de tabla ya soporta virtualización, pero está apagada. Hoy la tabla tiene cero registros, así que no hay problema de rendimiento visible; con importaciones reales de estados de cuenta sí lo habrá.

Se activará la virtualización en esa tabla (se dibuja sólo lo visible), dejando el umbral existente para que en volúmenes pequeños el comportamiento no cambie.

### 4. Paginación por cursor — se documenta, no se implementa
La recomendación de migrar los listados al patrón de scroll infinito ya existente en Facturas es correcta a futuro, pero hoy ningún listado se acerca al límite. Implementarla ahora significaría reescribir filtros, orden y exportación de siete módulos sin beneficio medible.

En lugar de eso se dejará una nota técnica en el repositorio con el patrón a seguir y el disparador claro: cuando un módulo muestre el aviso de truncamiento de forma habitual, se migra ese módulo.

## Detalles técnicos

- `Untranslated` (`src/components/ui/Untranslated.tsx`) se aplica en las definiciones de columnas y en los `MobileCardList` de las páginas de listado; sin cambios de lógica ni de datos.
- Nueva query `quotesLite` en el feature de cotizaciones: `select("id, quote_number")` + `.limit(LIST_PAGE_LIMIT)`, con su propia entrada en `quoteKeys`. `CRMPage.tsx` reemplaza `useQuotes()` por ese hook para construir `quoteMap`.
- `BankReconciliationPage.tsx`: se pasa `virtualized` al `DataTableV2` de líneas; `DataTableV2` ya aplica `virtualizationThreshold`.
- Nota técnica en `docs/` sobre el patrón `useInvoicesInfinite` (cursor + `loadMore`) como referencia de migración.
- Sin migraciones de base de datos ni cambios en Edge Functions.
- Se agregan pruebas unitarias del nuevo hook ligero y de las celdas que ahora usan `Untranslated`.
- Última tarea: entrada nueva en `public/changelog.json` + `public/changelog/v7.259.1.json` y sincronización de `package.json` / `public/version.json`.
