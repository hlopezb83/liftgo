# Propuesta separada: paginación de Cotizaciones con orden natural

Actualización: la fase RPC local posterior se documenta en [quotes-natural-rpc-local-2026-11-08.md](./quotes-natural-rpc-local-2026-11-08.md). Este documento conserva el diagnóstico/diseño anterior y sus límites históricos.

Estado: diseño para revisión, no migración, no aplicado, no subido. El experimento REST de esta rama NO está aprobado como sustituto equivalente del orden natural existente.

## Por qué REST no basta

La proyección/schema actual tiene `quote_number` texto, `created_at` y UUID; no contiene una columna numérica de orden del folio. No se ha demostrado ninguna relación garantizada entre fecha y folio, y no se usará fecha como sustituto. PostgREST `.order("quote_number")` ordena texto según la colación del backend. El comparador anterior usa `localeCompare(..., { sensitivity: "base", numeric: true })`: `COT-9999` precede a `COT-10000`. Reordenar únicamente una página no arregla el orden global.

Opciones sin migración:

1. REST paginado con orden textual explícitamente rotulado: menor cambio operativo, pero cambia semántica; sólo experimento, pendiente de decisión.
2. Descargar TODOS los matches por lotes y ordenar localmente: conserva el comparador del navegador, pero pierde el objetivo de lectura acotada y escala mal. Además no hay snapshot común entre requests. No recomendado.
3. Desactivar orden del folio temporalmente: evita presentar orden engañoso, pero elimina una capacidad existente. Requiere decisión.

Recomendación: RPC específico de lectura con filtro/orden/count/rango dentro de una misma consulta. Preparar y probar en base local efímera antes de convertir este documento en migración.

## Contrato propuesto

`public.get_quotes_page(p_search text default null, p_status text default 'all', p_page integer default 0, p_page_size integer default 25, p_sort jsonb default '[]') returns jsonb`.

Respuesta: `{ items: QuoteListItem[], totalCount: number, pageIndex: number }`. Sólo la proyección de lista existente; no incluir partidas, notas, IP, metadata de aceptación ni documentos. No modifica datos ni consume folios.

- `LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, public`.
- Rechazar `auth.uid() IS NULL` con 42501.
- Resolver `v_org := public.current_internal_organization_id()` (helper existente, Drizzle0031, sólo membresía interna inequívoca en empresa activa); rechazar NULL. No aceptar un tenant como autoridad desde el cliente.
- Cada lectura incluye `q.organization_id = v_org AND q.is_e2e IS DISTINCT FROM true` y permanece sujeta al RLS real del invocante. SECURITY INVOKER es esencial: no usar service_role, no cambiar propietario ni políticas para hacerlo funcionar.
- `REVOKE ALL ... FROM PUBLIC, anon`; conceder únicamente EXECUTE a authenticated. Es una nueva capacidad de lectura que necesita revisión de ACL/RLS antes de aplicar; no inferir aprobación de esta propuesta.
- Permisos de módulo siguen siendo las políticas de `quotes`. Verificar expresamente que roles sin lectura no ven filas ni conteos. RLS sin policy SELECT aplicable normalmente filtra a cero sin emitir error: para distinguir permiso denegado de empresa vacía, el RPC requiere además un predicado explícito de permiso de lectura equivalente a la autorización real (pendiente de definición y pruebas; no inventar un helper existente). Rechazar con42501 antes de consultar si ese permiso falla. Portal fuera de esta pantalla y fuera de este RPC.
- Validar parámetros: page0..100000, size1..100, search longitud razonable (p. ej.256 caracteres), status en dominio vigente, hasta5 elementos sort con `id`/`desc` del allowlist `quote_number, customer_name, total, status, valid_until`. Rechazar inválidos con22023. No concatenar entrada cruda en SQL.
- Orden por defecto `created_at DESC, id DESC`. Cualquier orden explícito termina con esos mismos desempates, NULLS LAST en ambas direcciones. Múltiples columnas preservan la prioridad enviada por UI.

## Orden natural: requisito previo explícito

El comparador actual usa locale del navegador (`undefined`), por lo que no existe una equivalencia universal de locales que pueda prometerse desde SQL. Definir una colación canónica española para la aplicación y aprobarla con fixtures comparativos. Debe conservar al menos orden numérico, insensibilidad de acentos/case, NULLS LAST y desempates estables.

Opción preferida, si PostgreSQL del destino ofrece ICU: colación dedicada `provider = icu, locale = 'es-u-kn-true-ks-level1', deterministic = false`. Usarla únicamente en las expresiones ORDER BY de columnas textuales del RPC, nunca alterar la colación de la tabla o sus índices/constraints existentes. Antes de crearla verificar disponibilidad y semántica en el mismo PostgreSQL/ICU del destino. No sustituir silenciosamente por colación textual si ICU falta.

Con esa colación, ordenar folios como texto natural evita conversión a float/JS Number y admite anchos variables. Pruebas obligatorias con `COT-0009`, `COT-0010`, `COT-9999`, `COT-10000`, `COT-900719925474099312345`, prefijos heredados y ceros iniciales. Para longitudes extraordinarias verificar límites de ICU; no asumir precisión. Si ICU no satisface el dominio, diseñar clave natural tokenizada (texto y secuencias de dígitos, dígitos por longitud y comparación binaria) y probarla antes de migrar; no introducir una aproximación parcial.

## Búsqueda y paginación en una consulta

- Normalizar el folio con regex/string, sin cast a integer: aceptar445,0445,COT-0445,cot-445,000445 y añadir igualdad canónica COT-0445 además del substring en cliente/folio. No usar `lpad(digits,4,'0')` directamente: PostgreSQL trunca entradas de más de4 caracteres. Usar ancho `greatest(4,length(digits))` tras quitar ceros iniciales conservando al menos un0. Probar folios de5 dígitos y superiores a2^53.
- Para nombres, usar una función de normalización explícita y probada (case y acentos). Confirmar esquema/disponibilidad de `unaccent` antes de proponer extensión. No asumir instalada. El mapeo/colación de búsqueda debe probar José/jose, Muñoz/munoz, ü, texto NFD y nombres de varias palabras; documentar ligaduras/Unicode fuera del contrato.
- Comparar substring literal con `strpos(normalized_column, normalized_search) > 0` para que `%`, `_`, `*`, barras, comas, comillas y paréntesis no se conviertan en instrucciones de LIKE/regex.
- Una CTE `filtered AS MATERIALIZED (...)` aplica scope+RLS+E2E+estado+búsqueda. De ese MISMO conjunto derivar count y filas ordenadas. Usar `row_number() OVER (...)`, normalizar page al último índice válido dentro de la consulta, y devolver sólo el rango pedido con `jsonb_agg(... ORDER BY rn)`.
- Count0 devuelve items[] y pageIndex0. Un error de autenticación, permiso, timeout o función ausente NO devuelve lista vacía.
- SQL del ORDER BY puede usar CASE estáticos por columna/dirección, o expresiones literales seleccionadas desde allowlist. Nunca interpolar el nombre/dirección proporcionados sin validación. Probar prioridades de sort múltiples.
- La función STABLE usa un snapshot por llamada para count y filas. Offset entre llamadas sigue pudiendo cambiar con nuevas inserciones/eliminaciones; documentar esa limitación o introducir cursor/snapshot separado si el producto exige navegación inmutable.

## Integración y pruebas antes de aplicar

Mantener el nuevo hook dedicado, scope de cache por tenant y `quoteKeys.lists()` para invalidación. Usar contrato RPC local tipado mientras no esté aplicada, sin editar types Supabase generados. No hacer fallback silencioso a sólo500 si el RPC falta: mostrar error recuperable y bloquear publicación hasta que el entorno esté preparado.

Suite SQL local necesaria: A/B tenants con501+ filas; roles permitidos/no permitidos; anónimo/portal/empresa inactiva/membresía ambigua; count nunca revela otro tenant; E2E excluido en conteo y rango; filtros combinados; búsquedas literales/acento/NFD; folios antiguos y grandes; orden natural global asc/desc atravesando límite de página; NULLS LAST; empates; página fuera de rango; input sort malicioso; error vs vacío. Comprobar ACL y `prosecdef=false`.

Añadir EXPLAIN ANALYZE en fixtures grandes para count/regex o normalización/sort. `count exact` puede ser caro, pero no debe reemplazarse por un total incorrecto. Sólo agregar índices tras medir y revisar su costo de escritura. Revisar journal Drizzle y esquema en snapshot completo.

Pruebas frontend y navegador: conservar las sintéticas de esta rama, cambiar transporte al contrato RPC y repetir1440×1000,360×800,390×800, errores/reintento, filtro y tamaño reinician página, atrás/adelante y detalle. Aprobar cambios de colación/semántica antes del despliegue. Nada de lo anterior se ha ejecutado en una base real ni se autoriza por este documento.
