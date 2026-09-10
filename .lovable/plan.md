# Corrección de /conciliacion-bancaria, /mis-reportes y /feedback

## Hallazgo previo: no falta ninguna función

Antes de proponer una migración consulté el estado real de la base de producción (solo lectura). Las 15 funciones que usan esas tres pantallas **existen hoy**, con una sola firma cada una (sin duplicados que provoquen ambigüedad) y con permiso de ejecución para usuarios autenticados:

| Pantalla | Función | Argumentos | Permiso `authenticated` |
|---|---|---|---|
| Conciliación | `get_bank_statement_lines_page` | `p_bank_account_id uuid, p_status text, p_search text, p_page_size integer, p_offset integer` | sí |
| Conciliación | `get_bank_reconciliation_kpis` | `p_bank_account_id uuid` | sí |
| Conciliación | `get_bank_match_candidates` | `p_line_id uuid, p_search text, p_date_window integer, p_amount_tolerance numeric` | sí |
| Conciliación | `confirm_bank_match` | `p_line_id uuid, p_payment_id uuid, p_supplier_payment_id uuid` | sí |
| Conciliación | `confirm_bank_matches` | `p_line_ids uuid[]` | sí |
| Conciliación | `ignore_bank_lines` | `p_line_ids uuid[], p_reason text` | sí |
| Conciliación | `unmatch_bank_line` | `p_line_id uuid` | sí |
| Conciliación (importar) | `begin_bank_statement_upload` | `p_upload_id uuid, p_bank_account_id uuid, p_file_name text, p_period_start date, p_period_end date, p_expected_count integer` | sí |
| Conciliación (importar) | `stage_bank_statement_chunk` | `p_upload_id uuid, p_chunk_index integer, p_lines jsonb` | sí |
| Conciliación (importar) | `finalize_bank_statement_upload` | `p_upload_id uuid` | sí |
| Feedback | `get_feedback_reports_by_status` | `p_status text, p_limit integer, p_before_created_at timestamptz, p_before_id uuid` | sí |
| Feedback | `change_feedback_status` | `_report_id uuid, _new_status text, _comment text` | sí |
| Feedback / Mis reportes | `get_my_feedback_points_total` | (sin argumentos) | sí |
| Feedback | `get_feedback_leaderboard` | `_period text` | sí |
| Interno | `cleanup_bank_statement_uploads` | (sin argumentos) | solo `service_role` (correcto) |

Las tablas que leen esas pantallas también existen con RLS activo y permisos coherentes: `bank_accounts`, `bank_statement_lines`, `bank_statement_imports`, `feedback_reports`, `feedback_status_history`. Las tablas de carga por bloques (`bank_statement_uploads`, `bank_statement_upload_chunks`) están cerradas al usuario final a propósito: solo se tocan desde funciones con privilegio elevado.

**Conclusión:** no puedo listar funciones faltantes porque, con el estado actual, no falta ninguna. Por lo tanto, una migración que "restaure funciones" no corregiría nada y no la propongo a ciegas.

## Qué falta para poder proponer la corrección

No tengo ningún registro del error: en este momento no hay reportes de consola, de red ni de fallos en tiempo de ejecución guardados para esas rutas. Necesito uno de estos dos insumos:

- El texto exacto del error que ves (mensaje en pantalla, o el error de la consola del navegador), indicando en cuál de las tres rutas ocurre y con qué rol de usuario.
- O tu visto bueno para reproducirlo yo, entrando a la aplicación de vista previa con una sesión de prueba y capturando el error, sin escribir nada en la base.

## Hipótesis a descartar en ese orden (solo lectura)

1. **La versión publicada es anterior a la reparación.** La versión publicada declara `8.2.0`, mientras que las funciones se restauraron después. Si el error solo aparece en el sitio publicado y no en la vista previa, la solución es volver a publicar, no una migración.
2. **Caché de esquema desactualizada.** Si la aplicación responde "no se encontró la función" pese a que existe, basta con recargar la caché del servicio de datos (`NOTIFY pgrst`), sin migración de esquema.
3. **Fallo dentro de una función existente** (por ejemplo, una columna que ya no coincide). Esto se ve en el mensaje de error concreto y se corrige con una migración puntual a esa única función.
4. **Regla de acceso (RLS) que bloquea al rol del usuario** en `feedback_reports` o en las tablas bancarias. Se corrige revisando políticas, no recreando funciones.

## Verificaciones SQL exactas para aprobar después

Todas son de solo lectura y no modifican datos:

```sql
-- 1. Existencia, firma y permisos de las funciones de las tres pantallas
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as puede_authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'get_bank_statement_lines_page','get_bank_reconciliation_kpis','get_bank_match_candidates',
  'confirm_bank_match','confirm_bank_matches','ignore_bank_lines','unmatch_bank_line',
  'begin_bank_statement_upload','stage_bank_statement_chunk','finalize_bank_statement_upload',
  'get_feedback_reports_by_status','get_my_feedback_points_total','change_feedback_status',
  'get_feedback_leaderboard')
order by 1;

-- 2. Sin firmas duplicadas (evita el error de llamada ambigua)
select proname, count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and proname like any (array['%bank%','%feedback%'])
group by 1 having count(*) > 1;

-- 3. La búsqueda bancaria conserva el escape de %, _ y \
select position('ESCAPE' in pg_get_functiondef(
  'public.get_bank_statement_lines_page(uuid,text,text,integer,integer)'::regprocedure)) > 0 as escape_ok;

-- 4. Reglas de acceso vigentes en las tablas de las tres pantallas
select tablename, policyname, cmd, roles from pg_policies
where schemaname='public' and tablename in
 ('bank_statement_lines','bank_accounts','bank_statement_imports','feedback_reports','feedback_status_history')
order by 1,2;
```

Verificación por URL después de aprobar: abrir `/conciliacion-bancaria`, `/mis-reportes` y `/feedback` en la vista previa con un usuario administrativo y confirmar que cargan lista, indicadores y columnas sin error.

## Alcance

Estrictamente esas tres rutas. Sin cambios de datos, sin tocar otras funciones o disparadores, sin refactorizaciones, sin publicar. Si tras conocer el error concreto hace falta una migración, será una sola, hacia adelante e idempotente (`CREATE OR REPLACE` de la función afectada más su `GRANT EXECUTE`), y te la presentaré para aprobación antes de aplicarla.
