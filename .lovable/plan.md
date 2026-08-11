# Revisión y mejora de la redacción del pagaré

## Cómo lo veo hoy

El texto actual es válido, pero es el mínimo indispensable. Le faltan fórmulas que en México son las que le dan fuerza ejecutiva y evitan defensas del deudor. Además tiene dos detalles concretos que conviene corregir.

Texto actual (resumen): "Por este PAGARÉ me(nos) obligo(amos) a pagar incondicionalmente a la orden de {arrendador}, en la ciudad de {ciudad}, el día {vencimiento_pagare}, la cantidad de {monto_pagare} (Pesos Mexicanos)... intereses moratorios {interes_moratorio}% mensual... renuncian al fuero y se someten a los tribunales de Monterrey, Nuevo León."

Problemas detectados:

1. **Jurisdicción quemada en el texto**: dice "Monterrey, Nuevo León" aunque el contrato tenga otra ciudad ({ciudad}). Incoherencia si se arrienda fuera de N.L.
2. **Falta el monto con letra**. La práctica mercantil y bancaria pide cifra y letra; ante discrepancia, prevalece la letra.
3. **Falta "por valor recibido"** y la referencia al contrato que garantiza (número de contrato y equipo con número de serie). Ayuda a acreditar la causa sin quitarle autonomía al título.
4. **Falta la renuncia expresa a presentación, protesto y avisos** (art. 1o. y relativos de la LGTOC en lo aplicable al pagaré). Sin ella el acreedor queda expuesto a formalidades innecesarias.
5. **No se define el aval en el texto** (hoy solo hay un recuadro de firma). Conviene la frase de obligación solidaria del aval.
6. **La tasa moratoria no aclara la base**: debe decir "por ciento mensual sobre saldo insoluto", y precisar que se calcula desde el vencimiento hasta el pago total.
7. **No hay cláusula de vencimiento anticipado** vinculada al incumplimiento del contrato de arrendamiento.
8. **Fecha y lugar de suscripción**: aparecen en el encabezado del anexo pero no en el cuerpo del texto, que es donde deben quedar para un pagaré autónomo.

## Redacción propuesta (nuevo DEFAULT_PAGARE)

```text
En {ciudad}, a {fecha_firma}.

Bueno por {monto_pagare} ({monto_pagare_letra}).

Por valor recibido a mi (nuestra) entera satisfacción, me (nos) obligo(amos)
incondicionalmente a pagar a la orden de {arrendador} la cantidad de
{monto_pagare} ({monto_pagare_letra}), moneda nacional, precisamente el día
{vencimiento_pagare}, en el domicilio de {arrendador} en {ciudad}, sin
necesidad de requerimiento previo.

Este pagaré se suscribe como garantía del cumplimiento de las obligaciones
derivadas del contrato de arrendamiento {contrato} celebrado respecto del
equipo {marca} {modelo}, serie {serie}, y su importe corresponde al valor de
reposición del equipo arrendado.

En caso de falta de pago puntual, la cantidad insoluta causará intereses
moratorios a razón del {interes_moratorio}% mensual sobre saldo insoluto,
desde la fecha de vencimiento y hasta su total liquidación.

El (los) suscriptor(es) y su(s) aval(es) renuncian expresamente a la
presentación, protesto, aviso por falta de pago y a cualquier otra
formalidad, así como al fuero de su domicilio presente o futuro,
sometiéndose a la jurisdicción de los tribunales competentes de {ciudad}.

Quien firma como aval se constituye en obligado solidario del suscriptor por
el pago total de este pagaré, sus intereses y accesorios.
```

## Qué cambia en la app

- Se actualiza el texto por defecto del pagaré con la redacción de arriba.
- Nueva variable `{monto_pagare_letra}` (monto en letra, p. ej. "TRESCIENTOS CINCUENTA MIL PESOS 00/100 M.N.").
- Nueva variable `{contrato}` (número de contrato) para citarlo dentro del pagaré.
- Las plantillas ya guardadas por el usuario **no** se sobrescriben: el nuevo texto aplica a quien use el predeterminado; en el editor de plantillas habrá un botón "Restaurar texto sugerido" para adoptarlo.

## Detalle técnico

- `src/lib/pdf/contract/data-templates.ts`: nuevo `DEFAULT_PAGARE`.
- `src/lib/format/numeroALetras.ts` (nuevo): conversor de número a letra en español mexicano con centavos en formato `NN/100 M.N.`, con pruebas unitarias (cero, unidades, "un mil", millones, centavos, redondeo).
- `src/lib/pdf/contract/placeholders.ts`: agregar `monto_pagare_letra` y `contrato` a `buildPlaceholderVars`.
- `src/lib/pdf/contract/placeholderRegistry.ts`: registrar ambas variables.
- `src/features/operations/components/operations/ContractTemplateTab.tsx`: botón "Restaurar texto sugerido" para el campo del pagaré.
- Tests: extender `src/test/contractPlaceholders.test.ts` y el smoke de PDF para confirmar que el anexo B no deja placeholders sin resolver.
- Changelog: entrada minor (v7.304.0).

Nota: esta es una mejora de redacción basada en la práctica mercantil mexicana; conviene una revisión final por su abogado antes de usarla en contratos firmados.
