# Plan operativo: habilitar una segunda organización

Estado de partida (sólo lo verificado): gate A/B 16/16 PASS, 1 operador de plataforma, 1 organización activa y 0 inactivas, ledger con 36 esperadas / 37 registros / 0 pendientes / 1 entrada histórica desconocida / 5 huellas distintas (0004, 0005, 0006, 0007, 0010), introspección del esquema activo PASS, restore omitido por decisión del propietario, inventario desplegado de funciones **UNKNOWN**.

Ningún paso de este plan da por cumplido nada que siga UNKNOWN.

---

## Fase 0 — Registrar decisiones (ChatGPT/GitHub)

- Responsable: ChatGPT + propietario aprueba por escrito.
- Acción: dejar asentado en el runbook que el gate de restore se omite como riesgo aceptado, con fecha y firma del propietario, sin marcarlo como verificado.
- Evidencia: commit documental.
- Salida: decisión escrita y fechada.

## Fase 1 — Resolver el inventario de funciones desplegadas

Opción elegida: **token de propietario + Supabase CLI/Management API fuera del repositorio**, con *redeploy controlado* como plan B.

| Opción | Riesgo | Requisitos | Costo | Fuerza de la evidencia |
|---|---|---|---|---|
| Export por soporte/proveedor | Bajo; nada se toca | Ticket y espera | Bajo en esfuerzo, alto en latencia | Alta si viene con versión y fecha; nula si responden sólo nombres |
| **Token de propietario + CLI/Management API (elegida)** | Bajo; es lectura. El riesgo real es el manejo del token | Token personal del propietario, terminal fuera del repo | Bajo, minutos | **Alta**: nombre, versión y fecha de actualización directos del proveedor |
| Redeploy de las 24 funciones | Medio-alto: es un cambio en producción; puede activar código nuevo no probado en vivo | Autorización explícita y ventana | Medio | Alta después, nula antes: crea una línea base pero no dice qué había |
| Invocar cada función para sondearla | Inaceptable: son funciones de negocio con escritura | — | — | Débil |

- Responsable: propietario genera el token; ChatGPT entrega el comando exacto; Lovable no participa.
- Regla: el token nunca entra al repositorio ni al chat. La salida se recorta a tres columnas: nombre técnico, versión, fecha de actualización UTC.
- Evidencia: tabla de 3 columnas guardada como archivo de evidencia sanitizado.
- Salida: inventario real obtenido, o declaración explícita de que sigue UNKNOWN (entonces se pasa al camino alternativo de la Fase 8).

## Fase 2 — Comparar inventario contra el repositorio (ChatGPT/GitHub, READ-ONLY)

- Script comparador que consume la tabla de 3 columnas y los nombres de carpeta de `supabase/functions` (24, excluyendo `_shared`).
- Verdicto por función: alineada / faltante en despliegue / sobrante en despliegue / **versión no demostrable** (cuando la fecha de actualización es anterior al último commit que tocó su carpeta).
- Evidencia: reporte PASS/FAIL por función, sin URLs ni identificadores.
- Salida: cero funciones críticas en estado "faltante" o "versión no demostrable".

## Fase 3 — Subconjunto crítico multiempresa (derivado del código actual)

Derivación usada: funciones cuyo código no de prueba menciona `organization_id` / `organizationStoragePath` / resolución de organización **y** ejecuta escrituras.

Críticas (verificar o redeployar antes de la segunda organización):

- `stamp-cfdi` (7 escrituras), `stamp-credit-note` (6), `stamp-payment-complement` (3)
- `cancel-cfdi` (3), `cancel-credit-note` (3), `cancel-payment-complement` (3)
- `reconcile-stamping-invoices` (16), `process-cfdi-retry-queue` (3), `refresh-cancellation-status` (1)
- `generate-recurring-invoices`, `generate-recurring-maintenance` (2)
- `validate-supplier-rep` (2), `validate-customers-tax-info` (1), `classify-feedback-report` (1)
- `download-cfdi` (2 — lectura de Storage con prefijo por organización)

Alto riesgo aunque hoy no filtren por organización en su código (crean identidades y roles): `invite-user`, `invite-customer`. Deben revisarse a nivel de código antes de la segunda organización.

No críticas para aislamiento: `delete-user`, `reset-user-password`, `toggle-user-status`, `parse-csf`, `generate-manual`, `validate-receptor-tax-info`. `migrate-storage-org-prefix` es una herramienta de migración: debe estar desplegada pero **no** ejecutarse.

- Responsable: ChatGPT (revisión de código), propietario (autoriza cualquier redeploy).
- Salida: cada función crítica queda con versión demostrablemente posterior a su último commit multiempresa, o redeployada con autorización.

## Fase 4 — Ledger: huellas históricas y entrada desconocida

- No reescribir migraciones aplicadas. No editar el ledger a mano. No hay migraciones pendientes, así que el esquema efectivo ya fue validado por introspección.
- Recomendación: **migración forward-only de atestación**, puramente documental en base de datos (una tabla o comentario de atestación), que registre: las 5 huellas divergentes conocidas, la entrada desconocida (id 31), la fecha de la introspección y su resultado PASS, y la decisión del propietario de aceptarlas.
- Debe comprobar antes de aplicarse: que sigue habiendo 0 migraciones pendientes, que las columnas `organization_id`, índices únicos por organización, triggers y policies que la introspección encontró siguen presentes, y que la atestación no toca datos de negocio.
- Requiere autorización explícita del propietario (es un cambio en la base activa).
- Alternativa sin tocar la base: dejar la atestación sólo en el repositorio. Más barata, evidencia algo más débil.

## Fase 5 — Gates restantes: criterios PASS/FAIL

| Gate | PASS | FAIL |
|---|---|---|
| Inventario de funciones | Tabla de 3 columnas del proveedor, 24/24 nombres presentes, sin sobrantes inesperados | Falta la tabla, falta una función, o hay sobrantes sin explicación |
| Versión de funciones críticas | Cada crítica con fecha posterior a su último commit multiempresa | Alguna crítica con versión no demostrable |
| Ledger | 0 pendientes y atestación registrada (en base o repo) de las 6 anomalías | Aparecen pendientes o divergencias nuevas |
| Esquema | Repetir la introspección READ-ONLY el mismo día del alta y obtener los mismos conteos | Cualquier conteo menor al de la línea base |
| Línea base | Exactamente 1 organización activa y 1 operador antes del alta | Cualquier otro conteo |
| Restore | Omitido por decisión escrita — **no se declara PASS** | — |

## Fase 6 — Alta de la segunda organización (requiere autorización)

Orden exacto, con verificación entre pasos:

1. Snapshot READ-ONLY previo: conteos por organización de las tablas operativas principales, organizaciones activas, operadores. Evidencia: agregados enmascarados.
2. Crear la organización **inactiva** mediante la RPC oficial de plataforma. Nunca con INSERT directo.
3. Verificar: sigue habiendo 1 organización activa; la nueva existe y está inactiva.
4. Asignar su primer administrador por el flujo oficial de invitación, con el rol interno `admin` acotado a la nueva organización.
5. Verificar: el nuevo administrador tiene exactamente un rol y una membresía, y ninguna en la organización existente.
6. Activar con `platform_set_organization_active`. Verificar: exactamente 2 activas.
7. Prueba de aislamiento con dos sesiones en navegadores/contextos separados: el administrador nuevo no ve ningún registro, factura, cliente ni archivo de la organización original, y viceversa; los folios arrancan independientes; el logo global LiftGo se muestra igual en ambas.
8. Snapshot posterior y comparación contra el paso 1: los conteos de la organización original no deben haber cambiado.

Contención/rollback si algo falla:

- Cualquier fuga observada en el paso 7: suspender de inmediato la nueva organización con la RPC oficial y detener el alta. La organización original nunca se toca.
- No borrar la organización nueva; dejarla inactiva conserva la evidencia.
- Si el administrador nuevo quedó con acceso indebido, revocar su rol antes que nada.
- Registrar hora, síntoma y evidencia enmascarada; reabrir el gate correspondiente.

## Fase 7 — Avance honesto

- **Código preparado: ~90%.** Multiempresa, RLS, portal, gate A/B, verificadores y documentación están hechos y probados en entorno efímero.
- **Operación productiva verificada: ~55%.** Verificado: operador, línea base, esquema activo, 0 pendientes. No verificado: inventario y versión de las 24 funciones desplegadas, atestación del ledger, y el alta real con prueba de aislamiento en vivo.
- **Falta para habilitar con seguridad: ~45% del trabajo operativo**, concentrado en la Fase 1 y la Fase 6.

## Fase 8 — Caminos

- **Principal:** Fase 0 → token del propietario y lectura CLI (Fase 1) → comparación (Fase 2) → revisión del subconjunto crítico (Fase 3) → atestación del ledger (Fase 4) → gates (Fase 5) → alta (Fase 6).
- **Alternativo, si el proveedor no entrega inventario y no hay token:** sustituir las Fases 1–2 por un **redeploy controlado y autorizado de las 24 funciones desde el commit actual**, en ventana acordada, funciones críticas primero, con prueba de humo de lectura después de cada bloque. Esto no revela qué había desplegado antes, pero establece una línea base conocida y fechada. El inventario previo queda registrado permanentemente como UNKNOWN.

---

## Reparto de responsabilidades (ahorro de créditos)

- **ChatGPT/GitHub:** scripts, comparador, documentación, revisión de código del subconjunto crítico, SQL de atestación redactado, runbook del alta.
- **Propietario/proveedor:** token, ejecución de la CLI fuera del repositorio, autorización de redeploy y de la atestación, aprobación del alta.
- **Lovable (sólo capacidades exclusivas del entorno conectado):** lecturas SQL READ-ONLY de verificación, aplicación de la migración de atestación si se autoriza, y las RPC oficiales de alta/activación de la Fase 6.
