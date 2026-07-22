# Plan: Regresión completa tras cierre de hallazgos de arquitectura

## Objetivo
Validar que el cierre de los 10 hallazgos de arquitectura no introdujo regresiones en tipado, tests ni violaciones a los guardrails de arquitectura.

## Alcance
- Typecheck completo del proyecto (`tsc --noEmit` o `tsgo`).
- Suite completa de tests unitarios e integración con Vitest.
- Ejecución de `scripts/arch-check.sh` para verificar guardrails G1-G5.
- Revisión de warnings de ESLint relevantes a boundaries.
- Reporte final con conteo de tests, errores y estado de cada verificación.

## Fases

### Fase 1: Typecheck
- Ejecutar `tsgo` (o `tsc --noEmit`) en todo el proyecto.
- Corregir cualquier error de tipado que aparezca.

### Fase 2: Tests
- Ejecutar `vitest run`.
- Asegurar que no haya tests fallidos ni warnings no atendidos.
- Si falla algún test relacionado con los movimientos de archivos, corregir la ruta de importación.

### Fase 3: Architecture guardrails
- Ejecutar `scripts/arch-check.sh`.
- Verificar que G1-G5 sigan en verde tras los movimientos de P3-8/P3-9 y P2-6.

### Fase 4: Reporte
- Documentar resultados: tests passing/total, errores de typecheck, violaciones de arch-check, y estado general.
- Si todo está verde, actualizar changelog a la siguiente versión patch.

## Criterios de aceptación
- Typecheck sin errores.
- 100% de tests pasando (o igual al baseline anterior si hay tests conocidamente pendientes).
- `arch-check.sh` sin violaciones.
- Changelog actualizado si el resultado es exitoso.