# PR360: publicación segura del ensayo manual

## Estado

Esta revisión parte de los ocho workflows presentes en
`6c9da61b37a0172e87599c1e8e3985681bba4674`. El nuevo ensayo se prepara en
`investigate/pr360-network-trial-manual-20261029`, separado de la rama de #360 y
del contrato offline de bootstrap. La publicación del ensayo y su ejecución local
en un runner desechable están autorizadas, condicionadas a revisión y auditoría
de triggers. Este documento no acredita todavía publicación ni ejecución.

El nuevo workflow de ensayo tiene únicamente `workflow_dispatch`, sin
`push`, `pull_request`, `workflow_call`, schedules ni invocaciones de CI general,
del catálogo productivo o de otros workflows. El ensayo no puede aprobar replay,
modificar el gate existente ni declarar resueltos los tres contratos SQL.

## Disparadores existentes

Los filtros descritos aquí pertenecen al código local auditado, no a una
certificación del estado actual de la configuración remota.

| Archivo y líneas | Eventos declarados | Efecto sobre una rama nueva distinta de `main`, sin PR |
| --- | --- | --- |
| [ci.yml:12](../.github/workflows/ci.yml#L12) | PR a cualquier base, salvo cambios exclusivamente ignorados; push sólo a `main`; manual en línea 23 | El push aislado no coincide. Abrir o actualizar una PR sí puede iniciar CI general. |
| [gitleaks.yml:7](../.github/workflows/gitleaks.yml#L7) | PR a `main`, push a `main`, manual | El push aislado no coincide. |
| [rls-db-tests.yml:13](../.github/workflows/rls-db-tests.yml#L13) | PR a `main` y push a `main`, ambos con filtros de rutas; manual en línea 68 | El push aislado no coincide. Una PR a `main` puede dispararlo por rutas de tests, SQL o dependencias. |
| [multi-tenant-ab.yml:16](../.github/workflows/multi-tenant-ab.yml#L16) | PR a `main` y push a `main`, con filtros de rutas; manual en línea 129 | El push aislado no coincide. Una PR a `main` puede iniciar el replay y navegador A/B según su diff completo. |
| [pr357-catalog-validation.yml:3](../.github/workflows/pr357-catalog-validation.yml#L3) | Reutilizable `workflow_call` y manual `workflow_dispatch` | No tiene autorun propio de push/PR; CI general lo llama como job. |
| [codeql.yml:9](../.github/workflows/codeql.yml#L9) | Schedule semanal y manual | No se dispara por ese push/PR. El cron existente es independiente de publicar la rama. |
| [prod-smoke.yml:8](../.github/workflows/prod-smoke.yml#L8) | Schedule horario y manual | No se dispara por ese push/PR. Su ejecución normal contacta la interfaz pública publicada; no debe seleccionarse para el ensayo. |
| [restore-rehearsal-verify.yml:4](../.github/workflows/restore-rehearsal-verify.yml#L4) | Sólo manual con inputs específicos | No se dispara por ese push/PR. Puede usar el secret del entorno de restore y no pertenece al ensayo. |

En estos ocho archivos no se encontraron `workflow_run`, `repository_dispatch`,
`pull_request_target`, `release`, `create`, `delete`, `check_run` o `check_suite`.
No hay un encadenamiento por esos eventos que se pueda inferir de este checkout.
Las acciones compuestas bajo `.github/actions` no son workflows independientes.

No hay filtros `tags` ni eventos de creación de tags o release en esos archivos.
Los cuatro `push` están limitados a la rama `main`; un push de tag no es un push
de esa rama. No se propone publicar un tag como ruta alternativa: las
automatizaciones remotas ajenas a estos archivos no se han inspeccionado.

## Por qué abrir una PR no sirve para aislar la publicación

`CI` tiene `pull_request` sin filtro de rama base. Que la PR sea borrador o esté
apilada sobre #359/#360 no evita ese evento. Un cambio del ensayo que incluya
scripts o YAML tampoco queda cubierto por el ignore de Markdown.

Además, [ci.yml:374](../.github/workflows/ci.yml#L374) llama al catálogo Supabase
cuando hay migraciones, falla el detector o el evento es manual. Lanzar `CI`
manualmente fuerza ese carril y otros jobs generales; no equivale al ensayo
aislado. El diff de una PR apilada depende de su base, por lo que no debe
evaluarse usando solamente los archivos del último commit.

## Lecturas remotas anteriores a la publicación

La búsqueda autorizada de la rama exacta y de PRs abiertas cuyo head sea esa rama
devolvió listas vacías. Los siete YAML existentes en la rama predeterminada que
se pudieron leer mantienen los push limitados a `main`; el catálogo #357 todavía
no existe allí, por lo que esa lectura devolvió not-found. En la rama del ensayo
sí está presente y su trigger es sólo reusable/manual. CI en default filtra PR a
`main`, mientras el código de la base #360 permite PR a cualquier base: abrir una
PR con el ensayo sigue siendo una vía inadecuada para aislarlo.

Las búsquedas no sustituyen verificar el SHA remoto tras publicar. No se
inspeccionaron Apps, webhooks, settings ni reglas de organización externas.

## Secuencia de publicación autorizada y todavía pendiente de ejecución

1. Revisar el commit final completo y sus triggers. Exigir que el nuevo YAML sea
   sólo manual y que el ensayo no importe/invoque el bootstrap, Supabase start,
   migraciones, CI general, workflows de replay ni herramientas de despliegue.
2. Confirmar mediante una lectura autorizada del estado remoto que la rama
   elegida es distinta de `main` y no es head de una PR existente. Esta revisión
   local no acredita ese dato. No reutilizar la rama remota de #360.
3. Sólo después de completar la revisión y estas comprobaciones, subir ese commit a la rama
   nueva, sin crear/actualizar PR ni tag, y verificar el SHA remoto. Según los
   filtros auditados, ese push no coincide con ninguno de los cuatro workflows
   existentes que escuchan `push`.
4. Comprobar el resultado real de esa única publicación antes de otra escritura.
   Si aparece una ejecución inesperada, detener la secuencia y reportarla; no
   seguir con dispatch suponiendo que el aislamiento de triggers funcionó.
5. Confirmar que el workflow manual nuevo es invocable por la UI autorizada con
   ese ref. **Su disponibilidad/registro en la rama por defecto no se ha
   comprobado aquí.** No asumir que subir un YAML sólo a una rama hará aparecer
   automáticamente el botón manual.
6. Si no es invocable sin cambiar `main`, el procedimiento permanece bloqueado.
   No resolverlo mediante una PR, merge, un trigger temporal de push o un
   dispatch HTTP por una ruta alternativa. Presentar ese bloqueo para una decisión
   de alcance separada.
7. Una vez autorizada también la operación de infraestructura, seleccionar
   exclusivamente el workflow de ensayo, su ref y SHA final exactos, y su
   confirmación explícita. No seleccionar `CI`, `PR357 catalog validation`, RLS,
   A/B, Prod smoke o Restore rehearsal.

No se propone deshabilitar controles globalmente, añadir un commit de skip,
alterar filtros de otros workflows o cambiar la rama por defecto para publicar.

## Condiciones del ensayo y límites de esta revisión

El ensayo debe vincular ejecución y evidencia a SHA/run/intento/job/nonce, usar
recursos privados por identidad y exigir cleanup. Sólo infraestructura efímera y
señuelos locales; sin SQL histórico, credenciales de producto, backend remoto,
publicación, merge o despliegue. Un resultado de ensayo nunca es evidencia del
replay del mismo u otro SHA.

Aunque los filtros locales no coincidan, no se han revisado GitHub Apps,
webhooks, reglas de organización, settings de Actions, cambios remotos posteriores
o automatizaciones fuera de `.github/workflows`. Tampoco se ha confirmado la
disponibilidad del workflow manual nuevo. Esos límites requieren lecturas
autorizadas antes de convertir esta secuencia en una publicación efectiva.
