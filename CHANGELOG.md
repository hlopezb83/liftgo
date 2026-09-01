## [7.409.6] - 2026-09-01
### Refactor (auditoría R9 · deduplicación y privilegios) — R9-04 / R9-06 / R9-10 / R9-05
- R9-04: `stamp-cfdi/handler.ts` usa `resolveReceptorRegimenFiscal` del módulo compartido (igual que NC y REP). Comportamiento idéntico: global XAXX -> `"616"`, no global -> valor recortado + `isValidRegimenFiscalCode`. Sin cambios en el payload al PAC. Función redesplegada.
- R9-06: nueva migración idempotente que revoca `EXECUTE` de PUBLIC/anon/authenticated sobre `public.normalize_regimen_fiscal(text)` y conserva `service_role`. Sin llamadas desde la app (sólo aparece en `types.ts` generado). Incluye assert de privilegios en la propia migración.
- R9-10: `src/features/dashboard/lib/collectionForecast.ts` delega en el `isFxMissing` canónico de cash-flow; se conserva la bandera `fx_missing` de la vista y todos los cálculos/filtros del pronóstico.
- R9-05: sin cuarta lista. Nueva prueba `satRegimenSqlParity.test.ts` deriva los códigos del catálogo del frontend y los contrasta con el fuente SQL de `normalize_regimen_fiscal`.
- R9-07 intencionalmente sin cambios (no hay consumidor service/cron actual; sería especulativo).

