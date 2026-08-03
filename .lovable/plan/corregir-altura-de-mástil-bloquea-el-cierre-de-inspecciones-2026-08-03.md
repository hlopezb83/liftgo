# Corregir altura de mástil (bloquea el cierre de inspecciones)

## Qué pasa

Al cerrar la inspección de retorno, el sistema actualiza el montacargas y la base de datos rechaza el cambio porque la altura del mástil guardada es 4800 (milímetros) y el límite permitido es 20 metros.

Es como tener la estatura de una persona anotada como "170" en una casilla que espera metros: nadie mide 170 m. La casilla está bien; el dato está en la unidad equivocada.

Datos verificados hoy:

- Montacargas: 46 con 4800, 10 con 7620, 1 con 0, 1 con 3.5 (correcto).
- Modelos de equipo: 5 con 4800, 1 con 7620, 1 con 0, 1 con 3.5.

Como la restricción se creó como NOT VALID, las filas viejas conviven sin problema hasta que algo intenta actualizarlas — por eso el error aparece justo al cerrar la inspección.

## Qué voy a hacer

1. Migración de datos: dividir entre 1000 los valores mayores a 20 (4800 → 4.8 m, 7620 → 7.62 m) en `forklifts.mast_height_m` y en `equipment_models.default_mast_height_m`, y dejar vacío el valor 0 (no es una altura válida).
2. Validar la restricción existente `forklifts_mast_height_range_chk` para que a partir de ahora ningún registro pueda quedar fuera de rango.
3. Agregar la misma restricción de rango a `equipment_models.default_mast_height_m` (hoy no tiene), para que un modelo mal capturado no vuelva a contaminar los montacargas que se crean desde él.
4. Reintentar el cierre de la inspección afectada (reserva `2a64dc96…`) para confirmar que ya pasa.

No se cambia código de la aplicación: el formulario ya valida el rango 0–20 m, así que la captura nueva ya era correcta.

## Detalles técnicos

- Migración: `UPDATE` con `mast_height_m / 1000 WHERE mast_height_m > 20`, `SET NULL WHERE = 0`, en ambas tablas; luego `ALTER TABLE public.forklifts VALIDATE CONSTRAINT forklifts_mast_height_range_chk` y `ALTER TABLE public.equipment_models ADD CONSTRAINT equipment_models_mast_height_range_chk CHECK (...) ` validada.
- Verificación posterior con consultas de conteo (deben quedar 0 fuera de rango) y una prueba de `UPDATE` sobre el montacargas `MCGSC030A048/016`.

## Changelog

Nueva entrada `v7.279.1` (patch) en `public/changelog.json` y `public/changelog/v7.279.1.json`: corrección de unidades de altura de mástil y desbloqueo del cierre de inspecciones de retorno.
