# Gates para habilitar una segunda organización

Runbook versionado, **no destructivo** y reproducible. Describe cómo producir la
evidencia fechada de los dos gates que siguen abiertos —**ensayo A/B real** y
**restore probado**— y cómo aprobarlos. Este documento **no ejecuta nada** ni
autoriza cambios: es el procedimiento a seguir cuando el propietario autorice
cada ensayo.

Estado de los gates (última revisión: 2026-09-21):

| Gate | Estado | Evidencia |
| --- | --- | --- |
| CI completo en verde | **Verificado** para el commit `44dacee` (2026-09-20) | Runs [35543605798](https://github.com/hlopezb83/liftgo/actions/runs/35543605798), [35543605857](https://github.com/hlopezb83/liftgo/actions/runs/35543605857), [35543605759](https://github.com/hlopezb83/liftgo/actions/runs/35543605759) |
| Ensayo A/B real (datos + Storage + portal) | **Verificado** (corrida 9, commit `c4a6b69`, 2026-09-21) | Run [35566123833](https://github.com/hlopezb83/liftgo/actions/runs/35566123833), job `106228183532`, conclusión **success**. Log: «.dev.vars OK: 4 bindings presentes, URL loopback, sin ref productivo». Playwright: **16 passed** (29.6s) — seed, datos, Storage y portal aislados. Teardown: «Stopped supabase local development setup.». Artefacto seguro `multitenant-ab-evidence` (id `10624198616`, digest `sha256:26443b6a2ac1f62c1f6c8fb291663d09c3d8c660a8952280ac313991f746ce57`): el workflow sólo sube `reports/multitenant-ab-*` y `playwright-report-multitenant/`, nunca `.dev.vars`. CI complementario en verde: CI principal [35566124245](https://github.com/hlopezb83/liftgo/actions/runs/35566124245) y Gitleaks [35566123931](https://github.com/hlopezb83/liftgo/actions/runs/35566123931), ambos success. Histórico de corridas 1–8 (todas fallidas, superadas): corrida 1 (`55ee6cb`, run 35546306009) falló el seed de B por contexto de organización (corregido en 8.26.1); corrida 2 (`ca77e98`, run 35547021465) falló por organización inicial activa (8.26.2 la suspende por RPC y la restaura); corrida 3 (`887c514`, run 35547626020) falló el seed de roles por duplicado (8.26.3 con upsert); corrida 4 (run 35558699815) falló por invoices sin partidas (8.26.4 inserta una partida canónica cuadrada con el subtotal); corrida 5 (`c3415c9`, run 35560422331) falló 3 pruebas de navegador por login que no esperaba la sesión persistida (reutiliza `loginPortal` + señal de portal autenticado); corrida 6 (`91999fb`, run 35561265562) falló 4 pruebas por falta de `SUPABASE_PUBLISHABLE_KEY` server-side (añadida al `GITHUB_ENV`); corrida 7 (run 35561856480) falló por `getClaims` rechazando el JWT HS256 local (8.26.5 añade fallback `getUser`); corrida 8 (run 35565322198) falló porque `wrangler dev` validaba los JWT contra el ref productivo del `.env` versionado (8.26.7 crea `.dev.vars` efímero con bindings locales). El gate A/B queda **verificado para el commit `c4a6b69`**; un commit posterior exigiría su propio run. |
| Restore probado | **Pendiente** — requiere evidencia externa | — |

### Automatización del ensayo A/B (verificada en la corrida 9)

El gate A/B tiene un carril reproducible que corre **sólo** contra el
Supabase local efímero del runner:

- `.github/workflows/multi-tenant-ab.yml` — Postgres + gotrue + kong + postgrest
  + storage-api, mismo carril de migraciones que RLS DB tests, sin leer ningún
  secret; destruye el entorno con `if: always()`.
- `tests/multi-tenant-ab/fixtures/localBackend.ts` — guard fail-closed que
  endurece `productionGuard`: prohíbe el ref productivo, exige loopback,
  `E2E_ISOLATED_BACKEND=1` e identificadores `local*`, y rechaza cualquier
  escape remoto.
- Suites: `data-isolation.spec.ts` (API/PostgREST), `storage-isolation.spec.ts`
  (Storage API real: listar, descargar, URL firmada, objeto legado sin prefijo)
  y `portal-isolation.spec.ts` (portal A/B en navegador, id cruzado sin revelar
  monto ni nombre, mismo logo global LiftGo).
- Evidencia: JUnit/JSON/HTML de Playwright y una matriz A/B resumida sin
  tokens, credenciales ni identificadores reales.

**Gate verificado** en la corrida 9 (commit `c4a6b69`, run `35566123833`,
conclusión success, 16/16 Playwright). El siguiente gate externo pendiente es
**restore probado**.


**Criterio de cierre:** hasta que el ensayo A/B y el restore estén ejecutados,
documentados y aprobados con evidencia fechada, **no se habilita una segunda
organización** en el entorno productivo. El gate de CI cubierto no sustituye a
los otros dos.

No se marcan como realizados, y este runbook no los declara: migraciones
productivas `0030`–`0035`, asignación de operador raíz, conteo de
organizaciones, migración o borrado de Storage histórico y alta de la segunda
organización. Todos siguen en **requiere verificación**.

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

1. Seleccionar un respaldo reciente y registrar su marca de tiempo.
2. Restaurarlo en un **proyecto o instancia aislada**, nunca sobre producción y
   nunca sobre el entorno de la aplicación en uso.
3. Verificar arranque de la aplicación apuntando a la copia restaurada, con el
   guard anti-producción activo.
4. Ejecutar comprobaciones de integridad de sólo lectura sobre la copia.
5. Destruir el entorno restaurado al finalizar y dejar constancia.

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
