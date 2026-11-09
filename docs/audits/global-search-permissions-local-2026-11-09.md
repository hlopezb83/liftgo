# Búsqueda global: consultas por permiso y alias de Gastos

## Alcance

Candidato local sobre `794e0f6f3c380fd6bfa06b16beb60ec6ed82f99e` de `main`.
No modifica base de datos, políticas RLS, catálogo de navegación, permisos almacenados ni destinos de publicación.
No demuestra una fuga previa: la interfaz ya filtraba enlaces/resultados y la base conserva RLS. Corrige consultas innecesarias, aislamiento de caché y coherencia del acceso visible.

## Corrección

- Cada sección construye solicitudes únicamente con permiso efectivo `read` o `full`: Facturas, Cotizaciones, Clientes, Reservas y Entregas. Devoluciones sigue el módulo Entregas, como la ruta actual.
- Facturas además conserva la exclusión financiera de dispatcher. Un permiso financiero personalizado o antiguo no la elimina.
- Facturas, reservas, entregas e inspecciones de devolución incorporan `organization_id` explícito. Cotizaciones conserva su filtro de organización, datos de prueba, búsqueda exacta y búsqueda parcial existentes.
- Clientes sigue consultando `organization_customers` por organización con `customers!inner`. `customers` permanece identidad global; no se añade un filtro de organización inexistente a esa tabla.
- La caché incorpora organización verificada, usuario, rol efectivo y máscara completa de secciones, además del término. Un cambio de permisos no reutiliza resultados de otra máscara. El rol también se incluye porque RLS puede variar aunque la máscara coincida.
- Identidad/organización no resueltas y carga/error de roles o permisos impiden consultas. Una invocación manual de `refetch` también respeta el bloqueo. Resultados anteriores se ocultan mientras la autenticación se resuelve.
- Un fallo de roles/permisos tiene aviso de verificación de acceso y reintento propio. No se presenta como cero resultados. El reintento refresca únicamente las fuentes fallidas y mantiene bloqueadas las entidades hasta resolverlas; recuperarse sin permisos continúa sin emitir consultas de entidades.
- Los errores parciales y totales se calculan sólo entre solicitudes emitidas. Una respuesta autorizada vacía cuenta como éxito. Cero secciones autorizadas no crea un error ni mantiene el indicador de búsqueda indefinidamente.
- `searchEntities` exige una máscara explícita. Su único consumidor de producción es el hook; todos los consumidores directos existentes eran pruebas y se actualizaron. No se conserva un overload permisivo que pudiera reabrir consultas por omisión.
- El alias legacy `/expenses` conserva su URL, nombre y redirección a Cuentas por Pagar. La política compartida de navegación usa ahora `Facturas de Proveedor`, igual que el destino, en lugar de `Gastos`. No se reorganizan accesos de otros módulos.

## Evidencia y pruebas

El hook se prueba con QueryClient real y cliente Supabase real, interceptando HTTP con respuestas sintéticas: permisos independientes, tenant en cada solicitud, join global de clientes, identidad/rol/máscara, revocación y respuestas tardías, carga/error, búsqueda cerrada/corta, refetch, cero secciones y fallos totales/parciales.

Una suite adicional usa también `useUserRole` y `useRolePermissions` reales: fallo inicial de una o ambas fuentes, carga del reintento, recuperación, fallo repetido con permisos cacheados y recuperación sin permisos.

Los componentes usan cmdk real. El alias cubre las cuatro combinaciones de Gastos/CxP, exclusión de dispatcher, navegación por `/expenses` y revocación con el diálogo abierto. Las pruebas de navegación compartida cubren también query/hash y el destino CxP.

Validaciones locales:

- Suite final afectada: **147/147 pruebas en 11 archivos**, correctas, incluido el ajuste de recuperación señalado en revisión.
- Suite completa offline iniciada antes del último ajuste de feedback de acceso: **6.230/6.230 pruebas en 805 archivos**, correctas. Es evidencia provisional de regresión, no una ejecución completa sobre el SHA final. Las 11 suites afectadas sí se repitieron después del ajuste.
- ESLint completo antes del último ajuste y lint de todos los archivos modificados por ese ajuste: cero advertencias.
- TypeScript de aplicación y navegador, `arch:check` y `git diff --check`: correctos.
- Build sintético final mediante `browser-test-server.mjs --build-only`: correcto, con destino ficticio comprobado. Los archivos de entorno se apartaron sin leerlos y se restauraron; `public/version.json` se restauró.

## Límites

Las pruebas de red simulada comprueban qué solicita el cliente, no sustituyen la evaluación de RLS contra una base real. No se ejecutan migraciones ni se consultan datos operativos.

No cambia el plazo de refresco de permisos compartido. La revocación se aplica al observar el nuevo estado de permisos; no se promete propagación instantánea antes de ese refresco. Una solicitud ya iniciada puede terminar y permanecer en la entrada antigua de caché, pero no se expone bajo la máscara nueva.

No se ejecutó navegador real para este candidato ni CI remoto. El build y los tests locales no equivalen a aceptación visual móvil/escritorio o autorización de publicación. No se hizo push, merge ni despliegue.
