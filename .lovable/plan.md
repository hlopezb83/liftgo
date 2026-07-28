## Contexto (verificado en el código)

- Hoy la importación vive en `src/features/bank-reconciliation`: `lib/csvParsers.ts` (parseo), `components/BankStatementUploader.tsx` (input restringido a `.csv,text/csv`) y `hooks/mutations/useImportBankStatement.ts`.
- El contrato de salida ya existe y no cambia: `ParsedBankLine { posted_date, description, signed_amount, reference, hash }` + `ParseResult { lines, errors, periodStart, periodEnd }`.

## Lo que encontré en internet

La documentación pública de BBVA México **no publica un esquema del XML** de estado de cuenta. En la práctica circulan tres variantes:

1. **CFDI con complemento "Estado de Cuenta Bancario" (namespace `ecb`)** — es lo que suele bajarse desde banca en línea junto al PDF. Los movimientos vienen como nodos repetidos con atributos tipo `fecha`/`fechaOperacion`, `concepto`/`descripcion`, `deposito`, `retiro`/`cargo`, `referencia`, `saldo`.
2. **XML de BBVA Net Cash / Host to Host** (empresas) — estructura propia con nodos `Movimiento`/`Operacion`.
3. **XML "Excel-like"** (SpreadsheetML) que algunos bancos entregan disfrazado de XML.

Dado que no hay esquema oficial confiable, el parser **no debe asumir un layout fijo**: se construye tolerante a namespaces y con mapeo manual como red de seguridad.

## Qué se va a construir

### 1. `lib/xmlParsers.ts` (nuevo)
- Parseo con `DOMParser` nativo (sin dependencia nueva).
- **Detección heurística**: recorre el árbol, encuentra el conjunto de nodos hermanos repetidos más numeroso (los movimientos), y para cada campo evalúa atributos *y* nodos hijos por nombre normalizado (sin acentos, sin namespace, minúsculas):
  - fecha: `fecha`, `fechaoperacion`, `fechaliquidacion`, `date`
  - descripción: `concepto`, `descripcion`, `detalle`, `leyenda`
  - cargo: `retiro`, `cargo`, `debito`, `importeretiro`
  - abono: `deposito`, `abono`, `credito`, `importedeposito`
  - monto único: `importe`, `monto`, `amount`
  - referencia: `referencia`, `folio`, `numeroreferencia`, `clavetraspaso`
- Reutiliza `parseDateFlexible`, `parseAmount`, `hashLine` y `computeSigned` de `csvParsers.ts` (se extraen a `lib/bankParseUtils.ts` para no duplicar — regla DRY).
- Soporta fechas ISO con hora (`2026-07-01T00:00:00`) y formato `DDMMMYYYY` que BBVA usa a veces (`01JUL2026`).
- Regla de signo: si hay cargo/abono separados → `abono - |cargo|`; si hay monto único → se respeta el signo, y si el XML trae un campo `tipo` (`CARGO`/`ABONO`) se usa para forzarlo.
- Devuelve el mismo `ParseResult`, más un `detectedMapping` para mostrarlo en la UI.

### 2. Mapeo manual (fallback)
Si la detección no encuentra fecha o monto, el uploader muestra un panel con los nombres de campo hallados en el XML y selectores para que el usuario asigne fecha / descripción / cargo / abono / referencia. Ese mapeo se guarda en `localStorage` por cuenta bancaria para no repetirlo cada mes.

### 3. Vista previa antes de importar
Nueva tarjeta de previsualización (primeros 10 movimientos + totales cargos/abonos + rango de fechas + conteo de errores) con botón **Confirmar importación**. Aplica tanto a XML como a CSV, así el CSV también gana la previsualización.

### 4. `BankStatementUploader.tsx`
- `accept=".csv,.xml,text/csv,text/xml,application/xml"`.
- Enruta por extensión/contenido: si empieza con `<?xml` o `<` → `parseBankXml`, si no → `parseBankCsv`.
- Se agrega el perfil **"BBVA México (XML)"** a `CSV_PROFILES` (se renombra el tipo a `StatementProfile` manteniendo compatibilidad).
- Título de la tarjeta pasa a "Subir estado de cuenta (CSV o XML)".

### 5. Deduplicación
El `hash` se calcula igual que en CSV (fecha + monto + referencia + descripción), así que reimportar el mismo periodo en XML tras haberlo hecho en CSV no duplica movimientos, siempre que la descripción coincida. Se documenta esta limitación en el aviso de importación.

### 6. Tests
- `lib/__tests__/xmlParsers.test.ts` con fixtures de las 3 variantes (CFDI `ecb`, Net Cash, XML genérico), casos de: namespaces con prefijo, cargo/abono separados, monto único con signo, fecha con hora, nodo sin monto (error listado, no crash), XML malformado.
- Test de que `parseBankXml` y `parseBankCsv` producen el mismo `hash` para el mismo movimiento.

### 7. Cierre
Entrada nueva en `public/changelog.json` + `public/changelog/v7.248.0.json` (minor: nueva capacidad de importación).

## Detalle técnico

- Sin dependencias nuevas: `DOMParser` está en el navegador y el parseo es client-side, igual que el CSV actual.
- `xmlParsers.ts` se mantiene bajo 150 LOC dividiendo en `detectMovementNodes`, `buildFieldIndex` y `mapNodeToLine`.
- Nada de la base de datos cambia: se reusa `useImportBankStatement` tal cual.

## Riesgo conocido

Sin un XML real de BBVA no puedo garantizar que la heurística acierte al 100% a la primera. Por eso el plan incluye el mapeo manual y la vista previa: aunque la detección falle, la importación se puede completar. **Si me compartes un XML real (puedes tachar saldos y número de cuenta), afino la detección para que funcione sin intervención.**
