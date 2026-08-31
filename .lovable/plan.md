# Auditoría YAGNI — pulir lo que ya existe

## Resultado de la auditoría (hechos verificados)

El proyecto está sorprendentemente limpio para su tamaño:

- `knip` no reporta **ningún** archivo, export ni dependencia sin usar (solo 2 avisos de configuración).
- Solo 9 marcas de `TODO/FIXME/HACK/@deprecated` en todo `src` y `supabase/functions`.
- Ningún archivo de código supera las 350 líneas (el más grande, `src/integrations/supabase/types.ts`, es autogenerado).

Es decir: no hay grasa evidente que cortar en el código de la app. Lo que sí encontré son **cuatro bolsas de peso muerto y fricción** que se pueden pulir sin tocar reglas de negocio.

## Hallazgos priorizados

### Alto impacto — El changelog pesa más que la app
- `public/changelog.json`: 649 KB, 925 entradas, se descarga completo en `/changelog`.
- `public/changelog/`: 1,443 archivos de detalle, 1.6 MB en el bundle público.
- Es historial de 7 versiones mayores que nadie consulta más allá de las últimas semanas.

Propuesta: partir el índice en "recientes" (últimas ~60 versiones, servidas por defecto) y un archivo de archivo histórico cargado bajo demanda. Los detalles antiguos se quedan donde están, solo dejan de indexarse en el arranque.

### Medio impacto — Funciones backend posiblemente huérfanas
Cinco funciones no tienen ninguna referencia desde `src`:
`backfill-facturapi-serie-folio`, `generate-invoice-pdf`, `parse-cfdi-expense`, `process-cfdi-retry-queue`, `reconcile-stamping-invoices`.

`supabase/config.toml` marca 4 funciones como "cron-only", así que varias de estas son legítimas. Pendiente por verificar antes de tocar nada: cuáles son cron reales y cuáles son restos de una migración puntual (`backfill-*` tiene toda la pinta de ser de un solo uso). No se borra nada hasta confirmar función por función.

### Medio impacto — Índices de claves de caché sobredimensionados
- `src/features/audit/lib/queryKeys.ts`: 324 líneas.
- `src/features/dashboard/lib/queryKeys.ts`: 247 líneas.

Suman 1,229 líneas entre todos los módulos. Muchas entradas describen consultas con más variantes de las que la UI realmente pide. Revisión: dejar solo las claves con consumidor real.

### Bajo impacto — Librerías con un solo punto de uso
`@medv/finder`, `match-sorter`, `marked`, `date-fns-tz`, `papaparse`, `@use-gesture/react`, `cmdk`, `dompurify` tienen exactamente **un** archivo consumidor cada una. Ninguna es candidata automática a borrado (varias son de seguridad o accesibilidad), pero vale documentar por qué está cada una para que nadie las quite por error ni duplique su función.

Nota: `html-to-image` parecía sin usar, pero sí se carga de forma diferida en `src/features/feedback/lib/captureScreenshot.ts`. No tocar.

## Lo que NO se debe hacer

- No borrar edge functions cron sin verificar el programador.
- No tocar reglas de negocio, RLS, RPCs, máquinas de estado ni lógica fiscal. Todo el trabajo es de limpieza y presentación.
- No "simplificar" `src/integrations/supabase/types.ts` (autogenerado).

## Plan de ejecución propuesto

**Lote 1 — Aligerar el changelog (mayor ganancia visible)**
1. Generar `public/changelog-recent.json` con las últimas 60 versiones durante el prebuild.
2. `fetchChangelogIndex` carga el archivo reciente; el histórico completo se pide solo al presionar "Ver historial completo".
3. Ajustar `scripts/check-version.mjs` y `scripts/validate-changelog.ts` para validar ambos archivos.

**Lote 2 — Verificar y limpiar funciones huérfanas**
1. Consultar los cron programados en la base de datos.
2. Reportar la lista con veredicto por función (cron / manual / muerta).
3. Eliminar solo las confirmadas como muertas, con su prueba asociada.

**Lote 3 — Podar claves de caché sin consumidor**
1. Cruzar cada export de `queryKeys.ts` con sus usos reales.
2. Eliminar las no usadas (knip no las detecta porque se exportan desde un barril).

**Lote 4 — Documentar dependencias de un solo uso**
Una tabla corta en `architecture.md`: librería, archivo que la usa, motivo por el que existe.

## Detalles técnicos

- Cada lote cierra con `bun run typecheck`, `bunx vitest run` y `bun run knip`.
- Cada lote publica su entrada de changelog: Lote 1 `minor`, Lotes 2-4 `patch`.
- Sin migraciones SQL salvo que el Lote 2 revele un cron que haya que desprogramar.
