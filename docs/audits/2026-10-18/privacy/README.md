# K3: clasificación conservadora de incidentes y privacidad

- Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.
- Corrección de código y pruebas: `7f9a0b763f391fb4bf593f5c18d16adf81955266`.
- Rama: `fix/audit-privacy-20261018`.
- Entorno: ASUS Windows, Node `24.19.0`, Vitest `4.1.11`. Pruebas locales con SDK/transportes en memoria; no son reproducciones sobre datos publicados.

## Comportamiento y ubicaciones

| Bloque | Archivo y líneas de la corrección | Antes | Después |
| --- | --- | --- | --- |
| Clasificación de mensajes | `src/lib/observability/privacyOptions.ts:3-23` | Cualquier prefijo `LC_` descartaba todo el evento, incluso fatal o con una excepción técnica adicional. | Todo fatal se conserva. En error, todos los textos presentes deben coincidir íntegramente con una validación enumerada para descartar el evento. Se conservan códigos desconocidos, delimitadores distintos, textos nuevos y cadenas mixtas. Info/warning continúan descartados. |
| Privilegios 403 | `src/lib/observability/databasePrivilegeFailure.ts:3-20`, `captureOperationalError.ts:10-17`, `serverSentry.server.ts:125-139` | El cliente descartaba todos los 403; el servidor descartaba todos los 4xx. | Cliente y servidor conservan evidencia estructurada de privilegios PostgreSQL: `code === "42501"` y `permission denied for table`, `column` o `function` en message/details/hint. Los 403 genéricos, rechazos de rol, RLS y los 401 permanecen descartados. |
| Saneamiento | `databasePrivilegeFailure.ts:16-20`, `privacyOptions.ts:26-27,49-61` | La pérdida del evento impedía diagnosticar; los errores sin status podían llevar el mensaje del proveedor. | Los incidentes de privilegios usan un Error genérico por categoría; no copian nombres de objetos, SQL, details/hint ni cuerpo. El resto mantiene el saneamiento existente compartido; el servidor elimina además extra y datos de petición. |
| Regresión | `errorsOnlyFilter.test.ts:18-69`, `captureOperationalError.test.ts:12-39`, `serverSentry.test.ts:109-126` | Fallos en 11 pruebas del contrato requerido. | Validación positiva/negativa, cliente/servidor y ausencia de valores sensibles sintéticos. |

La única validación `LC_` encontrada por búsqueda literal en el repositorio es `LC_COT_VENCIDA`, en la prueba existente. La lista permite sólo ese código con `:` exacto y texto vacío o `venció`; no presupone otros contratos del backend. Los dos mensajes esperados históricos de credenciales y restablecimiento de contraseña ahora también exigen coincidencia completa. Una nueva redacción se conserva para revisión en vez de quedar oculta por una coincidencia parcial.

El criterio 403 es deliberadamente limitado: el status por sí solo y SQLSTATE 42501 por sí solo no distinguen autorización esperada de una falta de privilegios técnicos. Si el proveedor elimina el código o el diagnóstico específico, un 403 no se captura automáticamente; si una restricción legítima devuelve el diagnóstico estructurado completo, se conserva como señal para revisar, sin afirmar que sea una configuración incorrecta. No se pretende una clasificación perfecta con información que el proveedor no entrega. No se evalúan getters del error al clasificar el servidor.

## Evidencia ejecutada

Los mismos 32 casos se ejecutaron con los tres archivos de implementación restaurados desde `git show ec177edf865671a9e9952f5cccd56a9db687f0bd:<archivo>` y después con la corrección. El replay guardó y restauró las copias corregidas en `finally`; las pruebas nuevas se mantuvieron iguales. El helper nuevo no es importado por el código base. Los errores iniciales de configuración de dependencias/temporales se resolvieron antes de estas ejecuciones y no se cuentan como fallos de producto.

| Ejecución | Resultado | Registro |
| --- | --- | --- |
| Antes, implementación base y pruebas nuevas | exit 1; 11 fallan / 21 pasan, 32 casos | `before.txt` |
| Después, mismos casos | exit 0; 32 pasan, 3 archivos | `after.txt` |
| Regresión observability y appFeedbackTelemetry | exit 0; 72 pasan, 10 archivos | `regression.txt` |
| ESLint de los siete archivos cambiados | exit 0; sin diagnósticos | `lint.txt` |

Preparación local de temporales (PowerShell, necesaria por un EPERM de rename en TEMP del sandbox):

```powershell
New-Item -ItemType Directory -Path .vitest-tmp -Force | Out-Null
$env:TEMP = (Resolve-Path .vitest-tmp).Path
$env:TMP = $env:TEMP
```

Comando exacto de las pruebas comparables antes/después:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/observability/errorsOnlyFilter.test.ts src/lib/observability/captureOperationalError.test.ts src/lib/observability/serverSentry.test.ts --maxWorkers=2
```

Comando exacto de regresión:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/observability src/lib/ui/__tests__/appFeedbackTelemetry.test.tsx --maxWorkers=2
```

Comando exacto de lint:

```powershell
node node_modules/eslint/bin/eslint.js src/lib/observability/privacyOptions.ts src/lib/observability/databasePrivilegeFailure.ts src/lib/observability/captureOperationalError.ts src/lib/observability/serverSentry.server.ts src/lib/observability/errorsOnlyFilter.test.ts src/lib/observability/captureOperationalError.test.ts src/lib/observability/serverSentry.test.ts
```

## Pendiente de integración

El coordinador ejecutará el tipado y build finales con los once hallazgos integrados. La ejecución local `node node_modules/typescript/bin/tsc --noEmit` se interrumpió por coordinación para evitar procesos globales duplicados; no se presenta como verificación concluida. No se ejecutaron migraciones, operaciones sobre cuentas, transacciones ni QA de navegador. No se desplegó ni se fusionó la rama.
