# Auditoría del Lote 3 (mayores viables)

Revisión del estado actual de los tres paquetes que quedaron aplazados en el Lote 3 de la auditoría del 14 ago 2026.

## Resultado de la auditoría

| Paquete | Actual | Última | Veredicto |
| --- | --- | --- | --- |
| `@testing-library/jest-dom` (dev) | 6.9.1 | 7.0.1 | **Actualizar ahora** |
| `jsdom` (dev) | 26.1.0 | 30.0.1 | **Actualizar con verificación** |
| `@types/node` (dev) | 24 | 26.2.0 | **Posponer** |

### 1. `@testing-library/jest-dom` 6 → 7 — riesgo bajo
La app solo usa 3 matchers de esta librería en todo el código: `toBeInTheDocument` (109 usos), `toBeDisabled` (5) y `toHaveTextContent` (2). Los tres siguen soportados en la v7. No hay matchers deprecados en uso, así que el salto de mayor casi no toca nuestro código.

### 2. `jsdom` 26 → 30 — riesgo medio, acotado
El entorno de pruebas por defecto es `happy-dom`; `jsdom` solo se activa en 7 archivos de prueba que lo piden explícitamente, entre ellos el smoke de PDFs (`src/lib/pdf/documents/__tests__/documents.smoke.test.tsx`), que es justo el que se rompió históricamente (v7.29.1). La superficie a validar es chica y bien identificada: si esos 7 archivos pasan, la actualización es segura; si el smoke de PDFs falla, se revierte a 26 y se documenta.

### 3. `@types/node` 24 → 26 — no actualizar
`.node-version` sigue en 24 y `engines.node` pide `>=24`. Subir solo los tipos declararía APIs de Node 26 que el runtime de CI no tiene. Queda condicionado a subir Node primero.

## Plan de ejecución

1. PR/lote A: subir `@testing-library/jest-dom` a 7. Verificar con typecheck, lint y toda la suite.
2. PR/lote B: subir `jsdom` a 30. Verificar primero los 7 archivos que usan el entorno jsdom (en especial el smoke de PDFs), luego la suite completa y el build. Si el smoke de PDFs falla, revertir a 26.1.0 y anotar el motivo en el documento de auditoría.
3. Dejar `@types/node` en 24 y registrar la condición para subirlo.

## Detalles técnicos

- Instalación explícita por paquete con `bun add -d`, nunca actualización masiva.
- Verificación por lote: `tsgo --noEmit`, `bun run lint`, `bunx vitest run`, `bun run build`.
- Actualizar `docs/dependency-update-audit-2026-08-14.md` con el resultado de cada lote.
- Changelog: una entrada `minor` por cada lote aplicado (cambios de dependencias de desarrollo, sin impacto en producción).
