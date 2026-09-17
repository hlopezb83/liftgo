# Preflight de rollout: vía oficial de migración y verificación (solo lectura)

Este documento responde tres preguntas y define el procedimiento de verificación.
No propone aplicar nada todavía. Todo es análisis; nada se ejecuta.

## Respuesta corta

1. **Sí existe una vía oficial**: la herramienta de migración de Lovable. Recibe SQL
   completo, lo registra como migración personalizada en `drizzle/migrations` y lo
   aplica con el migrador normal de Drizzle (drizzle-orm) sobre una conexión
   privilegiada que la plataforma provee. No es ejecutar SQL suelto: el contenido
   queda asentado en el mismo registro que usa el repositorio.
2. **No hay forma de correr `drizzle-kit migrate` contra producción desde aquí**:
   la cadena de conexión de producción no está disponible en este entorno; la
   herramienta oficial la inyecta por su cuenta. `bunx drizzle-kit migrate` solo
   existe en CI (`/.github/workflows/rls-db-tests.yml`) y corre contra un Supabase
   local efímero del runner, nunca contra producción.
3. **Respaldo y recuperación: no verificables desde Lovable.** No hay herramienta
   aquí para confirmar respaldos, recuperación a un punto en el tiempo ni ensayar
   restauración. Eso es, hoy, **la condición de paro principal** del rollout.

## Cómo decide el migrador: las 5 migraciones pendientes entrarían juntas

Evidencia del repositorio (`drizzle/migrations/meta/_journal.json` y el runbook
`docs/multiempresa/tramo-8-1-rollout-folio-rep.md`):

- El journal tiene 29 entradas (0000 a 0028).
- Producción va en 0023: su registro `drizzle.__drizzle_migrations` tiene 24 filas y
  la última marca de tiempo es 1789494754486, que coincide con la entrada 0023 del
  journal (evidencia viva, consulta de solo lectura).
- El migrador de drizzle-orm avanza **por marca de tiempo** (`created_at < when`),
  sin comparar huellas: aplica toda entrada posterior a la última registrada.

Consecuencia (inferencia del comportamiento documentado, no observada en producción):
una ejecución del canal oficial aplicaría **0024, 0025, 0026, 0027 y 0028 de una sola
vez**. No hay forma soportada de aplicar solo una ni de detenerse a la mitad.

```text
producción: ...0022  0023 |
repositorio: ...0022 0023 | 0024  0025  0026  0027  0028
                          ^ todo lo de la derecha entra junto
```

Qué es solo de CI: el paso «Aplicar migraciones Drizzle con drizzle-kit» del flujo
de pruebas de base de datos, sobre base efímera. CI nunca toca producción.

## Datos verificados de producción (consulta de solo lectura)

- Registro en 0023 (24 filas); pendientes 0024 a 0028.
- 1 organización activa.
- 1 cuenta de portal activa, con rol `customer` y **sin membresía interna**.
- De las 22 firmas que cubre 0028: **19 existen** y tienen EXECUTE directo al rol
  anónimo; **7** además tienen permiso explícito a público; las otras 3 aún no
  existen (las crean las migraciones pendientes).
- 310 archivos en Storage sin prefijo de empresa; las dos bitácoras de movimiento de
  Storage están vacías.

### Aclaración sobre el caso del «rol residual en portal»

El caso de una cuenta de portal con rol operativo residual **no existe en
producción**: la cuenta real tiene rol `customer` y ninguna membresía interna, así que
0025 no le quita ningún acceso. Ese escenario es **solo un caso sintético** de la
prueba `supabase/tests/rls/migration_chain_0024_0026.sql`, que lo simula para
verificar que el helper nuevo lo rechaza. No requiere decisión de negocio.

## Evidencia: viva vs. repositorio/CI vs. inferencia

| Afirmación | Origen | Tipo |
| --- | --- | --- |
| Cadena completa aplica limpio y suites pasan | GitHub Actions, base efímera | repositorio / CI |
| Registro en 0023, 5 pendientes | consulta directa | producción viva |
| 1 organización, 1 portal con rol customer, sin membresía interna | consulta directa | producción viva |
| 19/22 firmas presentes, EXECUTE directo anónimo; 7 también público | consulta directa | producción viva |
| 310 archivos sin prefijo, bitácoras vacías | consulta directa | producción viva |
| El migrador aplicaría las 5 juntas | comportamiento del journal + dialecto drizzle-orm documentado en el runbook | inferencia de código |
| Respaldo reciente y restauración ensayada | no verificable desde aquí | sin evidencia |

## Condiciones de paro (cualquiera detiene el rollout)

1. No hay confirmación externa de respaldo reciente ni de ventana de recuperación
   (fuera de Lovable).
2. El registro de producción no está exactamente en 0023 al momento de ejecutar.
3. Las 3 firmas aún ausentes deben quedar creadas por las migraciones pendientes
   (0025/0027); si alguna no se crea, 0028 la referenciaría sin efecto.
4. Confirmar que 0027 y 0028 no dejan ilegibles los 310 archivos sin prefijo de
   empresa (las reglas actuales ya fueron probadas en CI contra rutas históricas,
   pero la verificación final es en vivo).

## Verificaciones antes de aplicar (solo lectura)

- Registro: 24 filas, última marca 1789494754486.
- Existencia y firma exacta de las 22 funciones que toca 0028.
- Permisos actuales de esas funciones: anónimo directo y público, por separado.
- Conteo de archivos sin prefijo y de las dos bitácoras.
- Confirmación externa (fuera de Lovable) de respaldo y de ventana de recuperación.

## Verificaciones después de aplicar

- El registro avanza a 29 filas; la última corresponde a 0028.
- Las 22 firmas quedan sin permiso anónimo y, en las 7, sin permiso público; los
  permisos legítimos se conservan.
- Las dos firmas del folio de complementos funcionan por el canal autenticado y por
  el interno, sin error 42883.
- Entrar al portal con la cuenta real: cotizaciones, facturas y archivos abren.
- Entrar como administrador interno: perfiles y roles siguen visibles.
- Los 310 archivos sin prefijo siguen descargándose.
- La prueba horaria automática de la app publicada (`prod-smoke.yml`) sigue en verde.

## Alcance de este tramo

Solo lectura y análisis. Sin cambios de código, sin migraciones, sin permisos, sin
mover archivos de Storage, sin publicar, sin tocar changelog ni versión.
