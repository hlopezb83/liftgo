# Fase 2 — Paridad Facturapi 5.2.0 vs 6.0.0 (offline)

Sin despliegue, sin red al proveedor, sin llaves reales, sin documentos fiscales.

## Método
1. Dos copias aisladas: funciones operativas actuales (SDK 5.2.0) y árbol Fase 1 (SDK 6.0.0).
2. `parity_probe.ts`: reemplaza `fetch` por un doble que registra método, ruta, query, cuerpo,
   presencia de `AbortSignal` y cabecera de autorización, y devuelve respuestas ficticias.
   Ejecuta en ambas versiones: factura, nota de crédito, complemento de pago (REP), cancelación
   (motivo 02 y 01 con sustituto), consulta, refresco de estado SAT, descarga PDF/XML, errores
   400/404/500 y reintento ante 5xx. `diff.py` compara ambas salidas.
3. Suite fiscal offline completa (excluye smoke HTTP `index_test.ts` contra backend real y
   pruebas de transporte de Sentry que se cuelgan sin red).

## Resultado (2026-11-10)
- Sonda: 13/13 operaciones idénticas (peticiones, respuestas normalizadas y errores).
  Ver `resultado-5.2.json` y `resultado-6.0.json`.
- Suite 5.2: 1055 pasaron, 0 fallaron. Suite 6.0: 1060 pasaron, 0 fallaron. Mismos 90
  archivos salvo el contrato de SDK (`sdk5_contract_test.ts` → `sdk6_contract_test.ts`).
- Observación: las descargas PDF/XML directas del SDK no llevan `AbortSignal` en ninguna
  versión (sin regresión; la recuperación de PDF de NC sí usa helpers con señal desde Fase 1).

## Límites
No prueba el runtime desplegado, la respuesta real del SAT/Facturapi ni la persistencia ERP
con base real. Eso corresponde a la Fase 3 (sandbox ELOGISTIX con fixtures autorizados).
