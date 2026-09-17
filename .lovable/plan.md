# Preflight de rollout: ¿hay una vía oficial para migrar producción? (solo lectura)

Este documento responde tres preguntas y define el procedimiento de verificación.
No propone aplicar nada todavía.

## Respuesta corta

1. **Sí existe una vía oficial**, pero es una sola y no es "correr `drizzle-kit migrate`
   a mano": es la herramienta de migración de Lovable, que usa el migrador estándar de
   Drizzle con una conexión privilegiada que la propia plataforma provee.
2. **No**: desde Lovable no se puede verificar el respaldo ni la recuperación a un punto
   en el tiempo. No hay herramienta ni acceso al panel del proveedor.
3. Por eso el punto 2 es, hoy, **la condición de paro principal** del rollout.

## Hallazgo crítico: la cadena se aplicaría completa, no por partes

El registro del repositorio tiene 29 entradas (0000 a 0028). Producción va en 0023
(marca de tiempo 1789494754486). El migrador de Drizzle **avanza por marca de tiempo**:
aplica toda entrada posterior a la última registrada.

Consecuencia: cualquier ejecución del migrador aplicaría **0024, 0025, 0026, 0027 y
0028 de una sola vez**, en la misma ventana. No hay forma soportada de aplicar solo
0024, ni de detenerse en 0026.

```text
producción: ...0022  0023 |
repositorio: ...0022 0023 | 0024  0025  0026  0027  0028
                          ^ todo lo de la derecha entra junto
```

## Qué está probado y dónde

| Afirmación | Origen | Tipo de evidencia |
| --- | --- | --- |
| La cadena aplica limpia desde cero y las suites pasan | GitHub Actions, base efímera | repositorio / CI |
| El registro llega a 0023 y faltan 5 migraciones | consulta de solo lectura | producción en vivo |
| 1 organización activa, 1 cuenta de portal con rol residual | consulta de solo lectura | producción en vivo |
| 19 de las 22 firmas existen hoy, con permiso directo al rol anónimo | consulta de solo lectura | producción en vivo |
| 310 archivos sin prefijo de empresa, bitácoras de movimiento vacías | consulta de solo lectura | producción en vivo |
| Comportamiento de 0025 sobre la cuenta de portal real | **no probado** | ninguna |
| Respaldo reciente y restauración ensayada | **no verificable desde aquí** | ninguna |

CI nunca prueba el caso real: su base efímera no tiene esa cuenta de portal con rol
operativo residual, ni los 310 archivos sin prefijo.

## Condiciones de paro (cualquiera detiene el rollout)

1. No hay confirmación externa de respaldo reciente ni de ventana de recuperación.
2. No se ha decidido, con el área de negocio, qué pasa con la cuenta de portal que hoy
   conserva un rol operativo: tras 0025 deja de contar como personal interno.
3. El registro de producción no está exactamente en 0023 al momento de ejecutar.
4. Las 3 firmas ausentes de las 22 que cubre 0028: hay que confirmar que las crea
   alguna de las migraciones pendientes; si no, la migración fallaría.
5. Los 310 archivos sin prefijo de empresa: confirmar que 0027 y 0028 no cambian las
   reglas de acceso de forma que dejen de ser legibles.

## Verificaciones antes de aplicar (solo lectura)

- Registro de migraciones: 24 filas, última marca 1789494754486.
- Existencia y firma exacta de las 22 funciones que toca 0028; anotar cuáles faltan.
- Permisos actuales de esas funciones: anónimo directo y público, por separado.
- Membresías: cuántas internas, cuántas de portal, cuáles tienen rol operativo.
- Conteo de archivos sin prefijo de empresa y de las dos bitácoras de movimiento.
- Confirmación externa (fuera de Lovable) de respaldo y de ventana de recuperación.

## Verificaciones después de aplicar

- El registro avanza a 29 filas y la última corresponde a 0028.
- Las 22 firmas quedan sin permiso para el rol anónimo y sin permiso público en las 7
  que lo tenían; los permisos legítimos se conservan.
- Las dos firmas del folio de complementos funcionan por el canal autenticado y por el
  interno; el error 42883 no aparece.
- Entrar al portal con la cuenta real y abrir cotizaciones, facturas y archivos.
- Entrar como administrador interno y confirmar que sigue viendo perfiles y roles.
- Los archivos existentes sin prefijo siguen descargándose.
- La prueba automática horaria de la app publicada sigue en verde.

## Recomendación

No ejecutar el rollout hasta cerrar los puntos 1 y 2 de las condiciones de paro. La
decisión sobre el rol residual de la cuenta de portal es de negocio, no técnica, y el
respaldo debe confirmarse por un canal que no es Lovable.

## Alcance de este tramo

Solo lectura y análisis. Sin cambios de código, sin migraciones, sin permisos, sin
mover archivos, sin publicar, sin tocar changelog ni versión.
