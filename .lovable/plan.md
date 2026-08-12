# Corregir los montos del pagaré

## Qué está mal (verificado)

En el PDF `CTR-0003-pagare.pdf` conviven dos cifras distintas:

- Encabezado "Bueno por": **$334,479.00** — costo de adquisición del montacargas (correcto según la regla acordada).
- Cuerpo del texto: **"la cantidad de $21,000.00"** — ese es el **depósito en garantía** del contrato, no el monto del pagaré.

Causa confirmada: la plantilla guardada en la base de datos ("Plantilla Estándar") todavía tiene el texto viejo del pagaré, que usa el marcador `{deposito}`. El texto sugerido nuevo del código (que usa `{monto_pagare}` y el monto con letra) nunca se aplicó a la plantilla existente, así que el encabezado se calcula con la lógica nueva y el cuerpo con la plantilla vieja.

Errores adicionales que arrastra la plantilla vieja:
- No incluye el **monto con letra**, obligatorio en la práctica mercantil para un pagaré.
- La jurisdicción está **escrita a mano como "Monterrey, Nuevo León"**, en vez de tomar la ciudad del contrato (aquí San Pedro Garza García, N.L.).
- Interés moratorio impreso como **0% mensual**: el contrato CTR-0003 tiene `late_interest_rate = 0`. Un pagaré que declara 0% de mora es legalmente débil.

## Qué se va a hacer

1. **Migración de datos**: actualizar el `pagare_text` de las plantillas de contrato que aún tengan el texto legado (detectado por contener `{deposito}` en el pagaré) al texto sugerido actual, que usa `{monto_pagare}`, `{monto_pagare_letra}`, `{contrato}` y `{ciudad}`. No se toca ninguna plantilla que el usuario ya haya personalizado con `{monto_pagare}`.
2. **Blindaje del monto**: si por cualquier razón la plantilla en uso todavía trae `{deposito}` dentro del pagaré, el generador lo resolverá con el monto del pagaré (no con el depósito), para que encabezado y cuerpo nunca discrepen.
3. **Interés moratorio**: cuando el contrato tenga tasa 0 o vacía, el pagaré usará una tasa por defecto configurable en la plantilla en lugar de imprimir "0%". Se mostrará una advertencia en la pantalla de edición del contrato cuando la tasa esté en 0.
4. **Prueba de regresión**: test unitario que verifica que el monto del encabezado y el monto del cuerpo del pagaré son idénticos y que el monto con letra corresponde a la cifra.

## Detalles técnicos

- Migración SQL sobre `public.contract_templates`: `UPDATE ... SET pagare_text = <DEFAULT_PAGARE> WHERE pagare_text LIKE '%{deposito}%'`.
- `src/lib/pdf/contract/placeholders.ts`: exponer un mapa de sustitución específico del pagaré donde `{deposito}` se resuelve al monto del pagaré cuando se renderiza el Anexo B, y `interes_moratorio` cae a un valor por defecto si es 0/nulo.
- `src/lib/pdf/documents/contract/PagareAnnex.tsx`: usar ese mapa específico en `replacePlaceholders`.
- Tests nuevos en `src/test/contractPlaceholders.test.ts`.
- Changelog: versión **7.305.1** (patch) en `package.json`, `public/version.json`, `public/changelog.json` y `CHANGELOG.md`.

## Pregunta abierta

Si prefieres que la tasa moratoria en 0% simplemente **omita** esa cláusula del pagaré en lugar de usar un valor por defecto, dímelo y lo ajusto antes de implementar.
