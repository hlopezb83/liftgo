# Cambios propuestos al pagaré del contrato de renta

Revisé tu redacción contra el texto que hoy genera la app (`DEFAULT_PAGARE`). Tus dos cambios son válidos, pero le haría tres ajustes antes de aplicarlos.

## Comentarios a tu propuesta

**1. Párrafo de garantía (daños graves, robo parcial o total)**

Tu versión sustituye la frase actual "y su importe corresponde al valor de reposición del equipo arrendado. El incumplimiento... dará lugar al vencimiento anticipado".

- Conviene **conservar** la referencia al valor de reposición: es lo que justifica por qué el pagaré es por $334,479.00 y no por la renta. Sin esa frase, el monto queda sin explicación frente a un juez.
- Conviene **conservar** el vencimiento anticipado: sin él hay que esperar a la fecha de vencimiento para poder cobrar.
- Repetir "CTR-0003" dos veces es redundante; la segunda mención puede ser "del referido contrato y sus renovaciones".
- "contrato vigente" es ambiguo. Mejor "el contrato antes referido, así como sus prórrogas o renovaciones".

Redacción sugerida:

> Este pagaré se suscribe como garantía del cumplimiento de las obligaciones derivadas del contrato de arrendamiento {contrato}, celebrado respecto del equipo {marca} {modelo}, serie {serie}, así como de la responsabilidad del arrendatario en caso de daños graves, robo parcial o total o pérdida del equipo durante la vigencia del referido contrato y sus prórrogas o renovaciones. Su importe corresponde al valor de reposición del equipo arrendado. El incumplimiento de cualquiera de las obligaciones de pago del contrato dará lugar al vencimiento anticipado de este título.

**2. Párrafo de devolución/destrucción del pagaré**

Este es el ajuste importante: un pagaré debe contener una **promesa incondicional** de pago (LGTOC, art. 170). Meterle una condición de devolución dentro del propio título le da munición al deudor para pelear su carácter ejecutivo. La misma protección se logra al 100% poniendo esa obligación **en el contrato**, no en el pagaré.

Propongo:
- En el **contrato**, nueva cláusula (dentro del bloque de garantía/depósito):

> El pagaré suscrito como garantía será devuelto o destruido por EL ARRENDADOR cada vez que el contrato se renueve —sustituyéndose por uno nuevo— o al término de la vigencia, siempre que el equipo haya sido devuelto en buenas condiciones y no existan adeudos, daños o faltantes pendientes. La devolución se realizará dentro de los 10 (diez) días hábiles siguientes a la inspección de retorno.

- En el **pagaré**, sólo una línea neutral que no condiciona el pago:

> Este título será devuelto o cancelado conforme a lo pactado en el contrato de arrendamiento que garantiza.

Si prefieres tu texto tal cual dentro del pagaré, lo aplico — sólo quería que conocieras el riesgo.

## Qué se va a modificar

- `src/lib/pdf/contract/data-templates.ts`: nueva redacción de `DEFAULT_PAGARE` (párrafo de garantía ampliado + línea de devolución) y nueva cláusula de devolución del pagaré en el clausulado por defecto.
- Migración de base de datos: actualizar `pagare_text` y el clausulado de la plantilla predeterminada en `contract_templates` para que el admin vea el texto nuevo (sin tablas nuevas, sin cambios de RLS).
- Sin cambios de placeholders: `{contrato}`, `{marca}`, `{modelo}`, `{serie}`, `{ciudad}`, `{vencimiento_pagare}` ya existen.
- Pruebas: actualizar los snapshots/tests del PDF de contrato que verifican el texto del pagaré.
- Changelog `v7.332.0` (minor) en `public/changelog.json` + `public/changelog/v7.332.0.json`, y bump en `package.json` / `public/version.json`.

## Decisión pendiente

Dime si vamos con **A)** devolución dentro del contrato + línea neutral en el pagaré (mi recomendación), o **B)** tu párrafo completo dentro del pagaré.
