## Problema detectado

En `architecture.md`, la sección **§20 "Dependencias antes que código propio"** tiene subsecciones numeradas como **21.1 … 21.7** (heredado del plan original que iba a ser §21). Además, varias referencias cruzadas apuntan a `§21.4` cuando el contenido está realmente bajo §20. La sección §21 actual es "Referencias" (otro contenido).

### Inconsistencias concretas

| Línea | Texto actual | Debe ser |
|---|---|---|
| 419 | `### 21.1 Principio` | `### 20.1 Principio` |
| 426 | `### 21.2 Criterios para adoptar una dependencia (checklist)` | `### 20.2 …` |
| 435 | `### 21.3 Cuándo sí escribir código propio` | `### 20.3 …` |
| 444 | `### 21.4 Stack canónico (qué usar — no reinventar)` | `### 20.4 …` |
| 465 | `### 21.5 Proceso para introducir una dependencia nueva` | `### 20.5 …` |
| 473 | `### 21.6 Proceso para retirar código generado / hand-rolled` | `### 20.6 …` |
| 479 | `### 21.7 Anti-patrones` | `### 20.7 …` |
| 353 | `…stack canónico (ver §21.4).` | `…stack canónico (ver §20.4).` |
| 467 | `…stack canónico (§21.4).` | `…stack canónico (§20.4).` |
| 470 | `…documentarla en §2 (Stack tecnológico) y en §21.4.` | `…y en §20.4.` |

La referencia de la línea 370 (`Ver **§20**`) ya está correcta. La sección §21 "Referencias" (línea 489) queda intacta.

### Cambios en `public/changelog/v6.6.0-alpha.2.json`

El detalle del changelog también mezcla numeración: contiene `21.1 Principio` mientras el resto usa `20.x`. Normalizar todos los bullets a `20.1 … 20.7` para que coincida con el documento corregido. El título ya dice `§20`, así que solo cambia el primer bullet.

## Acciones

1. Renumerar los 7 encabezados de subsección de `21.x` → `20.x` en `architecture.md`.
2. Corregir las 3 referencias cruzadas `§21.4` → `§20.4` (líneas 353, 467, 470).
3. Normalizar el bullet `21.1 Principio` → `20.1 Principio` en `public/changelog/v6.6.0-alpha.2.json` (no se crea entrada nueva — es corrección del mismo registro de docs).
4. Verificar con `grep -nE "§(20|21)|### 2[01]\."` que no queden referencias cruzadas o subsecciones con numeración incorrecta.

## Fuera de alcance

- No se cambia el contenido textual de las subsecciones, solo la numeración.
- No se toca §21 "Referencias" ni ninguna otra sección.
- No se añade una nueva entrada de changelog (es corrección menor del mismo alpha.2).

## Riesgo

Nulo — solo renumeración y referencias cruzadas en documentación.
