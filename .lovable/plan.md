# Estado de los diffs fix-27-2 a fix-30-2

Revisé los cuatro archivos contra el código y la base de datos actuales. **Son los mismos hallazgos R5-01 a R5-19 que ya aplicamos** en las versiones v7.357.0 a v7.359.1. Verificación hecha:

| Fix | Estado |
|---|---|
| R5-01, R5-15 | Aplicado (migración 20260827020912) |
| R5-02, R5-13, R5-14 | Aplicado (funciones de cancelación y cola de reintentos) |
| R5-03, R5-04, R5-05, R5-10, R5-11 | Aplicado (migraciones 20260827031643–031934) |
| R5-06, R5-08, R5-12, R5-19 | Aplicado (migraciones 20260827033349–033533) |
| R5-09, R5-16, R5-17, R5-18 | Aplicado hoy en v7.359.1 |
| **R5-07** | **Pendiente (lo descartamos a propósito)** |

## Lo único pendiente: R5-07

El diff pide apagar el interruptor de "datos de prueba" (`allow_e2e_seed`) en la base actual. Hoy está **encendido** en producción-preview.

Por qué lo dejamos así: las pruebas automatizadas (E2E) lo necesitan y, si lo apagamos a secas, la suite deja de correr. Ya protegimos el caso importante: cualquier entorno nuevo nace con el interruptor apagado, y la función de seed exige rol de administrador.

### ¿Vale la pena?

Sí, pero de forma segura, no como pide el diff. Es como dejar la llave de mantenimiento puesta en la máquina: no cualquiera puede girarla, pero mejor guardarla cuando no se usa.

## Propuesta

1. Apagar `allow_e2e_seed` en la base actual (queda en `false`).
2. Ajustar `tests/e2e/global.setup.ts` para que la suite lo encienda al iniciar y lo **vuelva a apagar** al terminar (hoy solo lo enciende).
3. Verificar con la suite de pruebas y el build.

Si prefieres no tocar nada, la alternativa es dejarlo como está y cerrar R5-07 como "descartado", ya documentado en el changelog v7.359.0.

## Detalles técnicos

- Migración `UPDATE public.company_settings SET allow_e2e_seed = false;` (el DEFAULT ya es `false`; sin cambios de esquema).
- `global.setup.ts`: mantener el encendido con sesión admin; agregar teardown global que lo devuelva a `false`.
- Changelog: entrada patch `v7.359.2` + actualización de `CHANGELOG.md`.
