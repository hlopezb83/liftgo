# D2: concurrencia del depósito

La migración `0143_contract_deposit_concurrency.sql` añade
`set_contract_deposit_status_checked(uuid,timestamptz,text,numeric,text)`. La
revisión esperada es obligatoria y se compara después de `FOR UPDATE`, antes
del no-op o de cualquier cambio. La función conserva INVOKER, el alcance RLS,
los roles admin/administrativo y la semántica de importes parciales y fechas de
0070. Devuelve solamente el depósito y su revisión confirmada. No añade columnas
ni ejecuta escrituras de negocio durante la instalación.

La firma antigua se conserva para evitar errores ambiguos de resolución, pero
siempre rechaza la escritura y pide recargar la aplicación. No hay fallback
desde el cliente nuevo hacia la llamada sin revisión.

## Publicación

1. Revisar el PR directo en GitHub y verificar sus pruebas sobre el SHA final.
   Revisar también el árbol canónico de migraciones y su pin de CI; no omitir el
   guard ni ampliar exclusiones para aprobar una migración nueva.
2. Hacer preflight de lectura del ledger/definiciones/ACL del proyecto correcto.
   Aplicar la migración completa en **una transacción** por el canal oficial;
   comprobar que la RPC nueva y el rechazo legado quedaron activos juntos.
3. Publicar el cliente integrado desde Lovable. Entre los pasos 2 y 3 las
   pestañas antiguas no podrán guardar depósitos y deberán recargar. Esta pausa
   evita una ventana de sobrescrituras sin revisión.
4. Verificar el artefacto publicado y sus lecturas. No probar escrituras con
   datos productivos. Revertir sólo el frontend conserva el bloqueo seguro del
   endpoint antiguo; no restaurar escrituras sin revisión como rollback.

No se certifica aplicación productiva mediante este documento.

## Verificación aislada

Con Node y PostgreSQL locales, configurar `PG_BIN` con la carpeta de binarios y
`RUN_LOCAL_DEPOSIT_TESTS=1`, después ejecutar:

```sh
node scripts/tests/contract-deposit/run-local-postgres.mjs
```

El lanzador no acepta URL, puerto o cluster existente. Crea un cluster efímero
en loopback, verifica su directorio real y arranca con un esquema sintético.
La prueba de carrera usa dos conexiones y confirma el bloqueo real mediante
`pg_blocking_pids`; sólo el primer guardado persiste. Esto prueba el SQL de la
migración, no sustituye el replay completo del historial/RLS.

Las unitarias de `ContractDepositCard` y `useContractDeposit` cubren revisión
exacta con microsegundos, rechazo de respuestas incompletas, conflicto sin
reintento, refetch con borrador y recarga explícita/error. La suite RLS existente
conserva las comprobaciones de no-op, parcial y fechas con la nueva RPC.
`tests/inventory-design/medium-d2-deposit.spec.ts` usa únicamente transporte
ficticio y cubre el flujo completo; su ejecución se coordina con el build de QA.
