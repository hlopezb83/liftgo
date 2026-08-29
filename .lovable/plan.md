# Limpieza de documentación Markdown

Hoy el repositorio tiene **157 archivos `.md`**. De esos, **130 son planes archivados** de sesiones pasadas y buena parte del resto son reportes de auditoría con fecha fija que ya no describen el estado actual (v7.374.4). La propuesta deja **12 archivos vivos**.

## Inventario y decisión

### A. Planes archivados — borrar (130 archivos)

- `.lovable/*.md` (13 archivos, jul 2026) — planes sueltos anteriores a la convención de carpeta.
- `.lovable/plan/*.md` (117 archivos, ago 2026) — planes ya aplicados; su contenido efectivo vive en `CHANGELOG.md` y en el código.

Se borran del árbol de trabajo (siguen recuperables en el historial de Git) y se agrega `.lovable/plan/` a `.gitignore` para que los futuros planes aprobados no vuelvan a acumularse.

### B. Reportes de auditoría con fecha fija — borrar (10 archivos)

Son fotos de un momento ya superado; ninguno está referenciado por código ni por CI.

| Archivo | Motivo |
| --- | --- |
| `docs/coverage-matrix-r2.md` | Cobertura de v7.260.3 (jul), desactualizada |
| `docs/dependency-audit.md` | Auditoría §20 previa a las migraciones de dependencias ya hechas |
| `docs/dependency-update-audit-2026-08-14.md` | Snapshot de versiones de una fecha |
| `docs/mobile-qa-v6.13.2.md` | QA manual de v6.13.2 |
| `docs/e2e-roadmap.md` | Roadmap de v6.37.3; `tests/e2e/README.md` es la fuente vigente |
| `docs/lighthouse/baseline.md` | Baseline de v6.13.2 |
| `docs/audits/knip-2026-06-15.md` | Barrido de código muerto ya aplicado |
| `docs/audits/toasts-2026-06-23.md` | Auditoría cerrada (v6.109.0) |
| `docs/audits/R4-cierre.md` | Cierre de la ronda R4 (v7.150.0) |
| `docs/audits/h6-facturas-manuales-duplicadas-2026-08-25.md` | Análisis puntual ya resuelto |

Con esto desaparece la carpeta `docs/audits/`.

### C. READMEs micro dentro de `src/` — borrar (5) / conservar (2)

Borrar los que solo describen una carpeta vacía o una convención ya escrita en `architecture.md` §19:
`src/features/calendar/lib/README.md`, `src/features/operations/hooks/README.md`, `src/features/bookings/hooks/README.md`, `src/features/quotes/hooks/README.md`, `src/features/system/hooks/README.md`.

Conservar (contienen reglas de decisión reales, no repetidas en otro lado):
`src/components/domain/README.md` y `src/lib/domain/README.md`.

### D. Conservar y actualizar (7)

| Archivo | Acción |
| --- | --- |
| `README.md` | Actualizar stack, comandos y sección de documentación (apuntar solo a los docs que sobreviven) |
| `architecture.md` | Actualizar §15 (testing), §20 (dependencias, absorbiendo lo útil de `dependency-audit.md`), §23 (deuda técnica) y §24 (referencias muertas) |
| `CHANGELOG.md` | Sin cambios de contenido; solo la entrada nueva de esta limpieza |
| `docs/architecture-guardrails.md` | Verificar que los checks descritos coincidan con los jobs de CI actuales |
| `docs/paginacion-cursor.md` | Verificar el valor real de `LIST_PAGE_LIMIT` / `LIST_FETCH_LIMIT` y corregir si difiere |
| `.github/pull_request_template.md` | Revisar checklist contra los jobs de CI vigentes |
| `tests/e2e/README.md`, `supabase/tests/rls/README.md` | Verificar comandos y variables de entorno |

No se tocan los archivos bajo `.workspace/skills/` (los gestiona la plataforma).

## Resultado

De 157 a 12 archivos `.md`: `README.md`, `architecture.md`, `CHANGELOG.md`, 2 en `docs/`, 2 READMEs de `src/`, 2 READMEs de pruebas, el template de PR y los 2 de skills (no gestionados por nosotros).

## Verificación

- `rg` para confirmar que ningún archivo borrado queda referenciado desde código, CI, docs vivos o `knip.json`.
- `bun run lint`, build y suite de pruebas (no debería haber impacto).
- Changelog: entrada **minor** `v7.375.0` en `public/changelog.json`, su archivo de detalle y `CHANGELOG.md`.
