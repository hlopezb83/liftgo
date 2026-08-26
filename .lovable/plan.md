# Validación de fix-11.diff — los 5 hallazgos son reales

Revisé cada corrección contra las funciones que hoy están en la base de datos y contra el código de importación bancaria. Los cinco son bugs reales de conciliación bancaria y conviene aplicarlos.

## N-4 — Confirmar conciliación ignora el tipo de cambio — REAL

`confirm_bank_match` compara hoy `payments.amount` / `supplier_payments.amount` **en crudo** contra el importe del movimiento. Si la cuenta es en MXN y el pago está en USD, la validación de "el monto no coincide" rechaza conciliaciones legítimas (y, al revés, podría aceptar una equivocada). Las otras dos funciones del módulo (`get_bank_match_candidates` rama de clientes y `match_bank_statement_lines`) ya convierten con el tipo de cambio.

Acción: convertir el importe del pago a la moneda de la cuenta antes de comparar, con error claro cuando falta el tipo de cambio.

## N-5 — Los candidatos de pago a proveedor no convierten moneda — REAL

En `get_bank_match_candidates`, la rama de cargos (proveedores) filtra con `ABS(sp.amount - v_abs)`, sin usar `supplier_bills.exchange_rate`. La rama de clientes sí convierte y el emparejamiento automático también. Resultado: los pagos a proveedor en moneda extranjera nunca aparecen como candidatos y, si por casualidad coinciden en número, aparecen con el importe equivocado.

Acción: usar la misma expresión de conversión que el auto-match, mostrando el importe ya convertido.

## N-25 — Se puede conciliar un cargo con un pago de cliente — REAL

`confirm_bank_match` no valida el signo: hoy es posible ligar un cargo del banco (negativo) a un cobro de cliente, o un depósito a un pago a proveedor. El emparejamiento automático sí respeta la convención, pero la confirmación manual no.

Acción: rechazar la combinación cuando el signo del movimiento no corresponde al tipo de pago.

## N-23 — Dos movimientos idénticos en el mismo archivo se pierden — REAL

El hash de deduplicación se calcula con fecha + importe + referencia + descripción. Dos movimientos realmente distintos pero idénticos en esos campos (caso común: dos comisiones o dos SPEI iguales el mismo día, sin referencia) colisionan y el segundo se descarta en silencio por el `upsert ... ignoreDuplicates` contra el índice único `(bank_account_id, hash)`.

Acción: agregar la columna `line_seq` (posición de la línea en el archivo) e incluirla en el hash.

Nota de riesgo aceptada: el hash pasa a depender del orden de las líneas, así que si el banco re-emite el mismo periodo con una línea extra al inicio, la reimportación ya no deduplica y se cargaría dos veces. Hoy no hay riesgo de datos históricos: las tablas `bank_statement_lines` y `bank_statement_imports` están **vacías (0 filas)**, así que no hay que rehacer hashes existentes.

## N-24 — Importaciones a medias dejan basura — REAL

Dos caminos en `useImportBankStatement.ts` borran el encabezado del import pero no sus líneas:
1. Reimportación con 0 líneas nuevas: se borra el header sin borrar líneas.
2. Fallo del emparejamiento (`match_bank_statement_lines`): no hay limpieza alguna, queda el import con sus líneas sin conciliar.

Acción: borrar líneas antes del header en el caso 1 y envolver el matching en un bloque de limpieza en el caso 2.

## Detalles técnicos

- Una sola migración con las tres funciones/columna: `confirm_bank_match` recreada ya con la conversión de moneda **y** la validación de signo (N-4 + N-25 en una definición), `get_bank_match_candidates` recreada con la conversión en la rama de proveedores (N-5) y `ALTER TABLE ... ADD COLUMN line_seq integer` (N-23). Cumple las reglas permanentes: `SET search_path TO 'public'`, guards de rol con `(select auth.uid())`, `REVOKE ... FROM anon` y `GRANT EXECUTE ... TO authenticated`.
- Frontend: `bankParseUtils.ts` (campo `line_seq` en `ParsedBankLine` y en el hash), `csvParsers.ts` y `xmlParsers.ts` (pasan `lineSeq`), `useImportBankStatement.ts` (envía `line_seq` y limpia los dos caminos de N-24).
- Pruebas: prueba unitaria de `buildLine` verificando que dos líneas idénticas con distinto `line_seq` producen hashes distintos, y prueba de humo SQL en `supabase/tests/` para el rechazo por signo y por moneda.
- Changelog: entrada nueva **v7.344.0** (minor) con su archivo de detalle en `public/changelog/`.
