# CI de LiftGo

## Automático: ci.yml

Corre en cada PR hacia main, push a main y ejecución manual. No hay cron ni filtros que omitan cambios de documentación. El objetivo operativo es menos de cinco minutos de pared; los límites de cada job sirven para cortar procesos atascados y no acreditan rendimiento.

- Calidad: ESLint sin advertencias, tipos de aplicación y navegador, arquitectura, contratos de dependencias, Gitleaks, actionlint y contratos rápidos del aislamiento. Dependency Review corre en PR. Las funciones Deno y las migraciones modificadas conservan sus controles rápidos por área.
- Unitarias: toda la suite Vitest, sin cobertura ni selección por archivos cambiados. Las particiones son independientes, sin transferencias ni merge de artifacts. El input manual shards permite comparar 1, 2 y 4; PR y push usan cuatro inicialmente, sujetos a la medición remota.
- Build y smoke: una compilación real con backend ficticio y el smoke Chromium existente. Comprueba hidratación e interacción del Worker. Conserva proxy restringido, bloqueo de red externa y validación de bindings.

Los bloques comienzan independientemente. Cualquier fallo mantiene rojo el workflow. Cada job conserva su estado real; no hay un agregador que convierta skips en éxito. Una nueva corrida de la misma rama cancela la anterior.

Node y Bun se toman de los pins del repositorio y se verifican antes de instalar. Bun instala con frozen-lockfile y se comprueba que el lock no cambió. Las actions externas están fijadas por SHA. El token tiene contenidos de sólo lectura; Calidad añade lectura de PR. Se excluyen archivos de entorno locales antes de instalar. CI no recibe secretos productivos, publica, migra entornos compartidos ni escribe datos reales.

Las cachés contienen paquetes descargados y Chromium, con claves por SO, arquitectura y lock/pins. Nunca sustituyen instalación, compilación ni pruebas. Se guardan reportes de fallos durante tres días.

## Manual: validaciones-manuales.yml

Sólo workflow_dispatch. Selecciona browser, coverage, rls, multiempresa, codeql o all. El valor inicial browser evita arrancar bases de datos accidentalmente. La selección all inicia explícitamente todas las suites. No se ejecuta automáticamente al abrir una PR, integrar o por horario.

- browser: aceptación offline completa en los dos carriles existentes.
- coverage: seis shards con cobertura y merge verificado. Conserva todos los umbrales globales y por directorio. Para repetir cobertura usar Re-run all jobs: los artifacts tienen procedencia por intento.
- rls: Supabase efímero, replay canónico/Drizzle, recibos, suites SQL, concurrencia y contrato de inventario.
- multiempresa: gate A/B local con datos y Storage sintéticos, portal y revisión de cargos históricos.
- codeql: JavaScript/TypeScript, Actions y Python; sólo estos jobs reciben security-events: write.

Las bases son locales y desechables, sin secretos productivos. Se conservan preflight, guards, cron desactivado, verificaciones y teardown. Se retiraron las actions locales y los workflows separados anteriores. Los informes SQL quedan como artifacts, sin crear checks ni comentarios en PR.

Mover RLS, multiempresa, cobertura y navegador completo a manual elimina su ejecución automática: un CI rápido verde no acredita esas comprobaciones. Antes de integrar cambios sensibles de esquema, permisos, pagos o aislamiento entre empresas, ejecutar y revisar las suites manuales pertinentes.

Las E2E heredadas con escritura siguen requiriendo un backend aislado y las instrucciones de tests/e2e/README.md. El verificador de restauración permanece como comando local bun run restore:verify; no se conecta a una copia real sin su configuración explícita. Se retiraron el smoke productivo horario y los workflows de registro/ensayos puntuales.

## Limpieza y medición

La reconstrucción del 9 de noviembre de 2026 incluye eliminar el historial de Actions, logs y artifacts anteriores. El proceso usa un inventario fijo para no borrar las nuevas corridas de aceptación. La configuración anterior se recupera desde Git; el historial eliminado de Actions no se recupera con un revert.

Dependabot mantiene su configuración de actualizaciones. Los registros dinámicos de GitHub y sus alertas de seguridad son administrados por GitHub; no se duplica CodeQL programado en YAML. No se cambian la protección de main ni el despliegue de Lovable.

La aceptación exige diez corridas completas menores de cinco minutos, con caché fría y caliente. Se registran SHA, evento, particiones, resultado, tiempo desde creación hasta cierre, preparación/colas y pasos lentos. El registro de resultados se completará con evidencia remota; no se acredita la meta con estimaciones locales.

La validación fría detectó dos representaciones CDN alternantes de tslib@2.8.1 bajo la misma URL. Las pruebas Deno generan un import map temporal que usa una copia local de la fuente oficial, verificada contra un commit fijo de Microsoft y por SHA-256. Conservan todos los aliases del manifiesto actual y --frozen/--cached-only para el resto del grafo. El manifiesto y lock productivos permanecen originales. La procedencia y comparación de estructura están en [ci-tslib-integrity-2026-11-09.json](qa/ci-tslib-integrity-2026-11-09.json).
