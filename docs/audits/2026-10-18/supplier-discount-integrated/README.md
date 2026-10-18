# K1: migración y cliente integrados, sin activar

La edición previa reenvía `discount` mediante UPDATE de columnas, pero el rol no tiene ese privilegio. Este paquete contiene código real: `drizzle/migrations/0104_supplier_bill_details_rpc.sql`, journal y el cliente que llama `update_supplier_bill_details(uuid,jsonb)`. Sustituye la propuesta documental de PR273; aquella evidencia histórica no acredita este nuevo SHA.

Base: PR277 `e51f16d71d4180671fa3c4147fc514da2f37ac34`. Es una rama apilada: 0103 conserva sus bytes y 0104 ocupa el siguiente índice. No hace falta activar K1 para revisar o aplicar FX por separado. El migrador aplica todas las entradas pendientes del SHA seleccionado: **no usar este checkout para aplicar sólo 0103**. Primero aprobación y SQL servidor verificado; después cliente. Ninguna aprobación de preparación equivale a ejecutar los permisos propuestos.

SQL0104 LF SHA256: `eabf3090ca8a3e7585586ac416f528520b6f4d8d083b57caf84267545ef0b7e1`.

## Contrato y permisos propuestos

La RPC exige sesión authenticated, usuario activo admin/administrativo y contexto interno de una empresa activa. Bloquea la factura de esa empresa, usa allowlist de18campos y assignments estáticos; conserva constraints/triggers existentes. Un proveedor nuevo debe pertenecer a esa empresa y estar vigente.

Cambiar importes, moneda, TC o identidad fiscal de una factura aprobada, pagada, parcial, cancelada o con cualquier pago exige resolver el pago o la reaprobación por su flujo. Descripción/categoría/fechas de cobertura y vencimiento con importes idénticos siguen permitidas. Éstos son candados explícitos de la nueva RPC y requieren revisión del paquete.

Sólo propone EXECUTE authenticated sobre la nueva RPC y retira EXECUTE PUBLIC/anon/service_role. **No concede UPDATE de tabla ni discount**, no modifica ownership de objetos existentes y no reescribe datos. La firma nueva será propiedad del migrador que la cree; el owner y la ACL efectiva deben verificarse al activar. No se ejecutó nada de esto en la base publicada.

## Precisión y metadatos legados

Se retiró el rechazo adicional de2/6decimales de la propuesta v3. La RPC usa la coerción propia del rowtype existente, sin una política de escala nueva. La lectura autorizada del catálogo confirmó dinero `numeric(14,2)` y TC `numeric(14,6)`; no encontró precisión extra almacenada. El perfil de numeric sin typmod del fixture es una compatibilidad hipotética, nunca una afirmación sobre datos publicados.

El servidor compara los números JSON crudos contra OLD **antes** de `jsonb_populate_record`. Un cambio que el typmod redondearía de vuelta al valor anterior sigue sujeto a los candados. Tras coerción, todo cambio monetario debe ser finito, no negativo, descuento<=subtotal y total coherente con los componentes persistidos. No se permite un total inconsistente por redondeos individuales.

El formulario conserva el total original cuando componentes, moneda y TC son idénticos; cambiar sólo descripción no recalcula un total legado ni fabrica un cambio monetario. Si cambia el grupo monetario, display y submit usan la fórmula existente, calculada de los datos realmente enviados. Las validaciones habituales del formulario siguen vigentes; esto no habilita todos los datos legados inválidos.

## Evidencia comparable

- Misma matriz SQL de30casos: **10/30 antes (v3) →30/30 después (0104 exacta)**. `before-results.json` y `after-results.json` contienen SQLSTATE, perfiles y filas sintéticas; `cases.sql` no cambia entre fases. Cluster fijo `127.0.0.1:55442`; ambas ejecuciones registran stop0/status3.
- Mismo hook real del formulario, esquema, defaults y submit: **4/7 antes →7/7 después**. Tres fallos demostraban normalización involuntaria de totales al editar descripción. Transportes simulados; no hay API real.
- Cliente integrado: **33/33 en5archivos**, incluyendo contrato RPC y propagación de rechazo sin fallback raw ni éxito/invalidation falsos. `client-final.txt`.
- `input-hashes.json` distingue bytes ejecutados de fuentes normalizadas para publicación. Las entradas antes/después usaron los mismos bytes de casos/fixture; se sanearon rutas personales y formato de logs al publicarlos.
- Lint, tipos, build, journal y changelog se registran en sus archivos. La matriz95y las cinco carreras de PR273 son evidencia histórica de v3 y no se vuelven a atribuir a este SHA. No se amplió la matriz por el bloqueo de activación.

Los fixtures incluyen los helpers/guards de la propuesta anterior y perfiles sintéticos; no acreditan todos los triggers, ACL, RLS, API ni datos productivos. CI de la nueva rama y revisión del SHA exacto son puertas adicionales.

## Aplicación y compensación

El contrato del carril existente está en `docs/migration-release-contract.md`: runner oficial con conexión inyectada en `LOVABLE_DB_MIGRATION_URL`, frozen lockfile, `bun run migrations:check` y `bunx drizzle-kit migrate --config=drizzle.config.ts`. No se entrega URL/clave por chat ni argumentos. Drizzle pone pendientes+ledger en una transacción; requiere un único ejecutor y comparación fresca completa de ledger/hashes antes/después. No se crea un runner paralelo ni se modifica ledger manualmente.

La aplicación publicada sigue pendiente de autorización específica del coordinador/usuario y de confirmar el mecanismo Lovable acordado. Después se verifican firma, definer/search_path/flags, owner, ACL efectiva, ausencia de UPDATE(discount)/UPDATE global y disponibilidad del contrato RPC en API. Sólo entonces se publica el cliente aprobado. Refrescar metadatos/ledger en ese momento; el README no sustituye la lectura actual.

Compensación propuesta: retirar el puente cliente y, mediante una nueva migración aprobada, deshabilitar sólo EXECUTE de la RPC si hace falta contener sesiones antiguas, conservando la función y los datos. No DROP, no UPDATE global, no borrar ledger ni revertir descuentos/pagos. El cliente anterior conserva el defecto K1; esa retirada es contención, no recuperación funcional. La corrección forward compatible es preferible.

Sin Chrome, BUILD de Lovable, merge, publicación, permisos reales ni transacciones de negocio. El destino y las capturas internas permanecen en el paquete privado del coordinador; no se vuelven a publicar aquí.
