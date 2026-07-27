# Plan: Activar pruebas visuales en CI

## Estado actual
- Las specs `tests/e2e/visual-desktop.spec.ts` y `tests/e2e/visual-mobile.spec.ts` hacen `test.skip(!process.env.E2E_VISUAL)`.
- El job `e2e` en `.github/workflows/ci.yml` no exporta `E2E_VISUAL`, por lo que las 15 specs visuales se saltan.
- Los baselines (`*.spec.ts-snapshots/*-chromium-linux.png`) no existen en el repo; si se enciende el flag sin ellos, CI fallará con "A snapshot doesn't exist".

## Pasos para activar

### 1. Generar baselines en un entorno Linux determinista
Opción A (recomendada): usar el mismo runner de CI vía un workflow temporal o local con `act`:
```bash
E2E_VISUAL=1 bunx playwright test --grep visual --update-snapshots
```

Opción B: generar localmente en Linux nativo/WSL2 con Chromium headless. No se recomienda macOS/Windows porque las diferencias de fuentes renderizadas y subpíxeles generan falsos positivos en CI.

Resultado esperado: archivos nuevos bajo `tests/e2e/visual-desktop.spec.ts-snapshots/` y `tests/e2e/visual-mobile.spec.ts-snapshots/` con sufijo `-chromium-linux.png`.

### 2. Commitear los baselines
- Agregar los PNG generados al repositorio.
- Verificar que `.gitignore` no excluya `*.spec.ts-snapshots/`.

### 3. Encender el flag en CI
En `.github/workflows/ci.yml`, en el step "Run E2E tests", añadir al bloque `env`:
```yaml
E2E_VISUAL: 1
```

Esto hará que las specs visuales dejen de saltarse y Playwright compare contra los baselines commiteados.

### 4. Ajustes recomendados para reducir flaky visual
- Asegurar que las máscaras en `visual-desktop.spec.ts` cubran todos los elementos dinámicos (fechas, timestamps, montos en vivo).
- Considerar aumentar `maxDiffPixelRatio` temporalmente a `0.05` durante la primera semana para detectar inestabilidad sin bloquear merges.
- Agregar un job separado `e2e-visual` (opcional) para no ralentizar el job E2E principal; los visuales son más lentos y pueden requerir re-ejecución manual.

### 5. Verificación
- Ejecutar CI en una PR de prueba.
- Confirmar que las 15 specs visuales corren y pasan.
- Revisar artefactos de Playwright si hay diffs.

## Decisión pendiente
¿Prefieres que genere los baselines ahora mismo y active el flag en el mismo PR, o que primero prepare un workflow temporal solo para crear los snapshots sin modificar `ci.yml` todavía?
