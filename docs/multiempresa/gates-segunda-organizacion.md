# Gates para operar varias organizaciones

Runbook para pruebas aisladas. El propietario confirmó que existe una segunda
organización de prueba en Lovable Cloud; Git no revela su estado actual ni el
ledger productivo.

## Evidencia actual disponible en Git

- En `main`, el commit
[a21b527](https://github.com/hlopezb83/liftgo/commit/a21b527ffce794bf7fe019fec31b14ac7d5c22b2)
tiene CI principal y Gitleaks en verde:
[CI](https://github.com/hlopezb83/liftgo/actions/runs/36614039590) y
[Gitleaks](https://github.com/hlopezb83/liftgo/actions/runs/36614039561).
- El ensayo A/B del
[run 35566123833](https://github.com/hlopezb83/liftgo/actions/runs/35566123833)
pasó el 21 de septiembre sobre `c4a6b69ccb4fe0561d3660c2603b637336ec631f`.
No acredita el SHA actual.
- Git no contiene evidencia de una restauración de base y Storage completada
en un entorno aislado.
- Ledger, objetos de Storage, usuarios y secretos se deben revisar en el
proyecto Lovable Cloud correcto; no se deducen del mayor número de migración
versionado.

## Automatización A/B

El workflow
`.github/workflows/multi-tenant-ab.yml` y las suites en
`tests/multi-tenant-ab/` están diseñados para un backend local efímero. Cubren
separación de datos, Storage y portal mediante un guard que impide usar
producción. Ejecuta el workflow sobre el SHA que se propone liberar y conserva
el reporte del mismo SHA.

Los siguientes pasos son procedimientos, no
evidencia de ejecución. Registra conclusiones fechadas con SHA, run y resultado.

---

## 1. Precondiciones y bloqueo duro contra producción

Antes de cualquier paso:

1. **Autorización explícita y por escrito** del propietario para el ensayo
   concreto (A/B o restore), con fecha.
2. **Entorno efímero o aislado obligatorio.** Ninguna parte de este runbook se
   ejecuta contra la base, el Storage, los secretos ni el dominio productivos.
3. **Guard anti-producción activo.** Confirmar que el guard compartido de
   resolución de entorno (`productionGuard`) aborta si la URL, el proyecto o las
   llaves apuntan a producción. Si el guard no puede resolver el entorno, el
   ensayo **se detiene**: comportamiento fail-closed, nunca "continuar de todos
   modos".
4. **Credenciales separadas y desechables** para el entorno de ensayo. No se
   reutilizan secretos productivos ni se copian a este repositorio.
5. **Sin escrituras externas desde el repositorio.** El runbook no incluye
   comandos que publiquen, desplieguen ni modifiquen datos reales.
6. **Higiene de evidencia.** Ninguna captura, log o consulta adjunta puede
   contener credenciales, tokens, UUID reales de clientes ni datos personales;
   se usan identificadores ficticios y valores enmascarados.

Comprobación previa recomendada (sólo lectura, en el entorno de ensayo):

```bash
bun run migrations:check
bun run lint
bun run test:functions
```

---

## 2. Ensayo A/B en base efímera con dos organizaciones ficticias

Objetivo: demostrar que dos organizaciones coexistentes **no se ven entre sí**
en datos, Storage ni portal.

### 2.1 Preparación

1. Levantar una base **efímera** desde el carril oficial de migraciones
   (`drizzle/migrations`), sin datos productivos.
2. Sembrar dos organizaciones ficticias, por ejemplo `ORG-A-DEMO` y
   `ORG-B-DEMO`, cada una con: un administrador interno, un usuario operativo,
   un cliente de portal, catálogos mínimos y al menos un documento por flujo
   (cotización, reserva, factura, pago de proveedor).
3. Registrar la fecha, el commit exacto y el identificador del entorno efímero.

### 2.2 Datos (lecturas y escrituras)

Para cada par de roles de A y B, comprobar:

- **Lectura cruzada bloqueada:** un usuario de A no obtiene ninguna fila de B en
  listados, detalles por id, búsquedas, exportaciones ni reportes.
- **Escritura cruzada bloqueada:** un usuario de A no puede crear, actualizar ni
  borrar filas de B; el intento falla cerrado con error de permisos, no con
  éxito silencioso ni con 0 filas afectadas tratadas como éxito.
- **Folios y unicidad por organización:** A y B pueden usar el mismo número de
  folio sin colisión, y dentro de cada una la unicidad se respeta.
- **Identidad fiscal separada:** razón social, RFC y datos fiscales difieren por
  organización. El **logo es global y debe ser idéntico** en A y B: no es dato
  de tenant y no se verifica como aislamiento, sino como igualdad.

### 2.3 Storage

- Los objetos nuevos de A y B se escriben bajo el prefijo de su organización.
- Un usuario de A **no** obtiene URL firmada ni descarga de un objeto de B.
- Los objetos legados compartidos (sin prefijo) se inventarían y se reporta si
  alguno quedaría visible para la segunda organización. Si queda alguno,
  **el gate no se aprueba**.

### 2.4 Portal de clientes

- El cliente del portal de A sólo ve facturas, pagos y documentos de A.
- Un identificador de documento de B devuelve «no encontrado», sin filtrar
  montos, nombres ni existencia.
- El acceso verificado por organización se mantiene en las claves de consulta:
  cambiar de organización no reutiliza caché de la otra.

### 2.5 Evidencia a guardar (fechada)

Guardar en el expediente del ensayo, con fecha y commit:

- Resultado de la suite RLS y del smoke SQL sobre la base efímera (enlace al run
  o archivo de salida).
- Matriz de intentos cruzados: actor, recurso, resultado esperado y obtenido.
- Inventario de Storage con conteos por prefijo y por objetos sin prefijo.
- Capturas del portal de A y de B mostrando conjuntos de datos disjuntos, con
  datos ficticios.
- Declaración de que el entorno fue efímero y se destruyó al terminar.

---

## 3. Restore probado en entorno aislado

Objetivo: demostrar que un respaldo se puede **restaurar** y que el sistema
funciona sobre la copia restaurada. El respaldo diario **no cuenta** como gate.

### 3.1 Procedimiento

La restauración se realiza **fuera del repositorio** por el propietario o
administrador de la plataforma:

1. Seleccionar un respaldo reciente y registrar su timestamp UTC y el momento
   UTC del incidente simulado.
2. Crear un proyecto o instancia desechable, separado de producción.
3. Restaurar allí el respaldo por el canal oficial del proveedor. El workflow
   del repositorio **no ejecuta** `pg_restore` ni modifica ninguna base.
4. En GitHub, crear el environment protegido `restore-rehearsal` y guardar
   únicamente el secret `RESTORE_REHEARSAL_DATABASE_URL` de la copia. El
   environment debe requerir aprobación y el secret se elimina al cerrar el
   ensayo.
5. Lanzar manualmente
   `.github/workflows/restore-rehearsal-verify.yml` con el ref/host esperado,
   timestamps UTC de backup, incidente, inicio y fin del restore, objetivos
   RPO/RTO y la confirmación exacta `VERIFY-ISOLATED-RESTORE`.
6. Revisar el artefacto `restore-rehearsal-evidence`. Sólo contiene JSON y
   Markdown con conteos agregados, etiquetas `ORG-001` y buckets canónicos;
   nunca incluye la conexión, host/ref, UUID, rutas, nombres, correos o tokens.
7. Registrar la evidencia del restore real y destruir la instancia aislada.
   Borrar el secret del environment.

El workflow valida el destino antes de conectarse, bloquea el ref productivo
`zxefrzfaynnfwazqhwxp` y ejecuta todas las consultas dentro de una única
transacción `READ ONLY` con timeouts. Una corrida verde sólo acredita la
verificación posterior: el gate continúa **Pendiente** hasta adjuntar además la
evidencia del restore real, RPO/RTO aprobados y destrucción del entorno.

### 3.2 Métricas a medir

- **RPO** (pérdida máxima de datos): diferencia entre la marca de tiempo del
  respaldo y el momento del incidente simulado.
- **RTO** (tiempo de recuperación): minutos desde el inicio de la restauración
  hasta la aplicación operativa sobre la copia.
- Objetivo declarado por el propietario para ambos valores, y si el ensayo lo
  cumple.

### 3.3 Consultas y artefactos a adjuntar (sólo lectura)

- Conteo de filas por tabla operativa principal, comparado con el esperado.
- Últimos folios por organización y año.
- Estado del ledger de migraciones en la copia restaurada.
- Conteo de objetos de Storage disponibles frente a las referencias en base.
- Registro cronológico del ensayo con horas de inicio y fin.

Todos los artefactos se adjuntan con valores enmascarados: sin credenciales, sin
tokens y sin UUID reales.

---

## 4. Checklist de aprobación

Copiar esta lista al expediente del ensayo y llenarla. Los campos de enlace se
llenan con URLs de corridas; **no se escriben credenciales, tokens ni UUID
reales**.

| # | Requisito | Estado | Fecha | Enlace a la corrida o evidencia | Aprobó |
| --- | --- | --- | --- | --- | --- |
| 1 | Autorización escrita del propietario | ☐ | | | |
| 2 | Guard anti-producción verificado fail-closed | ☐ | | | |
| 3 | Base efímera creada desde el carril oficial de migraciones | ☐ | | | |
| 4 | A/B datos: lectura cruzada bloqueada | ☐ | | | |
| 5 | A/B datos: escritura cruzada bloqueada | ☐ | | | |
| 6 | A/B folios y unicidad por organización | ☐ | | | |
| 7 | A/B identidad fiscal separada y logo global idéntico | ☐ | | | |
| 8 | A/B Storage: prefijos aislados y sin legado compartido visible | ☐ | | | |
| 9 | A/B portal: conjuntos disjuntos y «no encontrado» en ajenos | ☐ | | | |
| 10 | Suite RLS y smoke SQL en verde sobre la base efímera | ☐ | | | |
| 11 | Restore ejecutado en entorno aislado | ☐ | | | |
| 12 | RPO y RTO medidos y dentro del objetivo | ☐ | | | |
| 13 | Artefactos de integridad adjuntos y enmascarados | ☐ | | | |
| 14 | Entornos efímeros destruidos | ☐ | | | |
| 15 | CI completo en verde para el commit del ensayo | ☐ | | | |

**Regla de cierre:** con cualquier casilla abierta, la segunda organización
permanece deshabilitada. La aprobación es del propietario y queda registrada en
este expediente y en el roadmap con fecha.
