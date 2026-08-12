# Ajuste de triggers en workflows de CI/CD

## Objetivo
Reducir ruido y consumo de minutos de CI ajustando únicamente los triggers (`on:`) de tres workflows, sin modificar jobs, permisos, pins SHA ni grupos de concurrencia.

## Cambios a aplicar

### 1. `.github/workflows/codeql.yml`
- Eliminar el trigger `pull_request` completo.
- Dejar: `push` a `main` (con `paths-ignore` actual), `schedule` semanal (lunes 12:00 UTC) y `workflow_dispatch`.
- **Nota:** se conserva el grupo de concurrencia y la expresión `cancel-in-progress` tal cual, aunque tras quitar `pull_request` la condición siempre será falsa; esto no afecta la ejecución en `main` ni en cron.

### 2. `.github/workflows/prod-smoke.yml`
- Cambiar el cron de `"*/30 * * * *"` (cada 30 min) a `"0 * * * *"` (cada hora en punto).
- Conservar `workflow_dispatch`.

### 3. `.github/workflows/lighthouse.yml`
- Cambiar el cron de `"0 11 * * *"` (diario) a `"0 11 * * 1"` (lunes 11:00 UTC).
- Conservar `workflow_dispatch` con su input `target_url`.

## Validación
- Revisar visualmente los tres archivos para confirmar que solo cambiaron las secciones `on:`.
- Ejecutar `yamllint` o `bunx yaml-lint` si está disponible, o al menos verificar sintaxis con `python3 -c 'import yaml; yaml.safe_load(open(...))'`.

## No incluido en este plan
- No se tocan jobs, steps, permissions, SHA pins ni `concurrency`.
- No se modifica `lighthouserc.json` ni la lógica de apertura de issues.
