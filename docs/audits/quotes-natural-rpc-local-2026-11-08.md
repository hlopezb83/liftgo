# Cotizaciones: RPC natural validada localmente

## Estado y procedencia

Implementación local separada, sin push/PR, aplicación remota ni despliegue. La rama `fix/quotes-natural-rpc-local` parte del experimento preservado `ee41d8388fbf1a6c1ef06b962cde110e93fbe8e8`, cuyo ancestro main verificado sigue siendo `026d1ce6d6eaa8350b27db0d23ce09c4c85951a5`. El candidato REST anterior y sus límites quedan como evidencia histórica, no como solución equivalente aprobada.

Esta fase reemplaza el orden textual experimental por una RPC con orden natural global, restaura el encabezado «Folio» y elimina el helper regex/URL experimental. No se cambian contratos de `useQuotes`, CRM, detalle, búsqueda global ni el aviso compartido. Se retiraron el traslado del helper global y el export de proyección heredados del prototipo REST: esos archivos vuelven a los bytes de main.

## Contrato y seguridad

Migración candidata `0129_quotes_server_page.sql` más journal, sin ejecución fuera de clústeres sintéticos propios:

- `get_quotes_page(uuid,text,text,integer,integer,jsonb)` es `STABLE SECURITY INVOKER`, con search_path fijo. Lee el tenant mediante el helper existente `current_internal_organization_id()`; `p_expected_organization_id` sólo verifica que coincida, nunca elige otra empresa.
- Requiere sesión, membresía interna inequívoca y empresa activa. Consulta el rol efectivo según la prioridad frontend y exige `role_permissions` read/full para Cotizaciones. Admin no salta un permiso none. Las lecturas continúan sujetas al RLS del invocante.
- Filtro explícito por organización y exclusión E2E antes de búsqueda/conteo/rango. Proyección exacta de lista, sin notas, partidas, IP, organización ni metadata de aceptación.
- Revoca EXECUTE a PUBLIC, anon y service_role, incluso grants directos heredados; concede sólo a authenticated. No crea credenciales, cambia políticas o escribe datos de negocio.
- Sort de hasta cinco columnas conocidas, dirección boolean, sin duplicados. Las expresiones SQL vienen exclusivamente de literales allowlisted y los valores usan parámetros. Límites page 0..100000, size 1..100, search 256 caracteres y estados válidos.
- Devuelve items/totalCount/pageIndex; cuenta y filas se obtienen de una CTE materializada bajo una sentencia y snapshot. Página fuera de rango se ajusta en el servidor; vacío devuelve 0/[]/page 0.
- Frontend usa contrato RPC local tipado, sin editar tipos Supabase generados. Valida proyección, conteo seguro, número de filas, clamp e IDs únicos. Conserva cache por tenant, invalidación de listas, abort, sesión y estado URL. Función ausente/permiso/error/respuesta inválida no dispara fallback silencioso a 500.

RLS que filtra filas sin error continúa produciendo el universo visible, incluido cero. La comprobación explícita de permiso distingue module-none de vacío; no se afirma detectar cualquier posible política adicional que oculte todas las filas.

## Orden y normalización

Se crea una colación ICU dedicada **root** `und-u-kn-ks-level1`, numeric y primary, no determinista. Se usa en ORDER BY textual y en la conversión a minúsculas de búsqueda; no cambia colaciones/índices/constraints de tablas. Preflight exige UTF8, proveedor/locale/deterministic correctos y versión catalogada igual a versión actual, fallando cerrado también ante NULL. ICU canoniza kn=true como kn; la forma canónica fue verificada en PostgreSQL 17.11.

Se verificó orden natural global asc/desc a través de páginas: COT-0009,0010,9999,10000 y folios mayores de 2^53, más prefijos heredados con secuencias numéricas. NULLS LAST, multi-sort y desempates created_at/id son explícitos. No se asume correlación fecha↔folio y no se ordena sólo la página local.

El comparador anterior usaba locale del navegador. La colación root evita diferencias accidentales de locale en el backend y conserva el corpus numérico/acento/case validado; **no promete equivalencia de todos los caracteres/puntuaciones con todos los locales de navegador**, ni semántica española universal. La propuesta previa mencionaba una opción española; esta implementación eligió root explícitamente. La disponibilidad y versión ICU del destino deben verificarse antes de migrar.

Búsqueda literal usa normalización NFD, case ICU, eliminación de marcas combinantes y transliteraciones latinas comunes heredadas (æ/œ/ĳ/þ/ð/ø/đ/ł), después `strpos`, sin interpolar LIKE/regex del usuario. El regex constante que elimina marcas opera con colación C determinista porque PostgreSQL 17 no admite regex con colación no determinista. No requiere extensión unaccent. Pruebas con José/Muñoz, Unicode NFD, MÜLLER/NIÑO, ligaduras, varias palabras y %,_,*,barras,comillas,comas/paréntesis/metacaracteres.

La igualdad canónica adicional admite 445/0445/COT-0445/cot-445/000445. Se trabaja con strings, sin float/bigint; lpad usa ancho máximo(4,longitud) para no truncar 10000 ni folios grandes. La búsqueda ya no expande URLs: el RPC envía parámetros JSON por POST.

## Evidencia ejecutada y límites

Runner `scripts/tests/quotes/run-local-postgres.mjs`: clúster nuevo propio, puerto 127.0.0.1 asignado, esquema vacío verificado, sin `.env`, HTTP bloqueado y cierre en finally. PostgreSQL 17.11 oficial Debian, ICU 153.128. Sesiones de lectura reales authenticated/NOSUPERUSER/NOBYPASSRLS con row_security=on, distintas del dueño.

Catorce escenarios SQL pasaron, incluyendo:
- 501 filas, seis páginas, tenant A/B, E2E, una fila adicional oculta por RLS y proyección exacta.
- ACL heredadas, rol efectivo, module-none, sesión/tenant esperado, portal, organización inactiva y membresía ambigua/mixta.
- Folios, búsqueda literal/acentos, inputs inválidos y ataques al orden, natural global, nulls y empates.
- Colación preexistente incompatible rechazada.
- Un reader comprobablemente bloqueado por advisory lock mientras otro backend inserta/commitea: count y filas conservan snapshot; la siguiente llamada observa el dato nuevo.
- 10,000 filas sintéticas, última página de 100 y conteo exacto; observaciones locales 67–132 ms, no SLA.

El esquema es **mínimo enfocado**, con el helper real de Drizzle 0031 y RLS PostgreSQL real, no replay de todos los triggers, constraints y policies productivos. Revisor independiente ejecutó un segundo clúster y corpus adicional; el reporte final identifica SHA y resultados exactos.

La validación de frontend incluyó 314 pruebas en 40 archivos del área Cotizaciones y consumidores afectados, ESLint global sin warnings, TypeScript app y browser, arch-check y build sintético fail-closed. No es la suite completa del repositorio.

Pruebas frontend usan SDK Supabase real con transporte simulado y componentes tabla/layout/router reales. En móvil y escritorio cubren total remoto, última página con la fila 501, búsqueda desde página posterior, conservación/limpieza de estado, URL obsoleta, error/reintento y loading distinto de vacío. La tabla solicita el orden natural al servidor; las tarjetas móviles mantienen enlaces accesibles al detalle. No se repitió Chromium: el intento de la fase anterior falló al arrancar por restricción de sockets del entorno, antes de ejecutar escenarios 1440/360/390. Spec read-only actualizado queda disponible para un entorno permitido; no hay certificación visual.

Se preparó localmente el pin CI para el árbol Drizzle `b9796acd9d2760affa564394056ea3f695b6a3ae`, que agrega únicamente 0129 y su journal. El árbol Supabase y las guardas CI/loopback/cron permanecen intactos. El preflight estático de fuentes pasó contra el HEAD local sin conexión a base de datos. Pasaron 38 pruebas Python de guardas CI y 97 Node de replay/diagnóstico/reporte. La revisión del pin y sus pruebas no equivalen a replay.

El replay completo **no se ejecutó**: este entorno no tiene Docker ni Supabase CLI ni es un runner GitHub Actions. El preflight oficial rechaza este contexto antes de abrir una conexión; no se falsearon variables ni se relajaron guardas. Antes de publicar: ejecutar el replay completo y SQL/RLS sobre el SHA definitivo en el runner autorizado, validar navegador y confirmar preflight de versión/ICU/ledger/ACL del proyecto correcto. No se afirma aplicación por existir archivos o pasar el fixture. Count exact y sort natural pueden costar más sobre universos grandes; medir EXPLAIN en esquema completo antes de agregar índices. El snapshot es por llamada: inserciones entre páginas pueden desplazar offsets; no se promete navegación congelada entre requests.
