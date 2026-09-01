# Arreglar los 6 tests rojos de stamp-cfdi

## Qué está pasando

Los 6 tests fallan porque todos responden 400 antes de llegar a lo que quieren probar. La causa es el RFC de prueba `AAA010101AAA`: no pasa la validación del dígito verificador del SAT (A4-05) que el handler aplica antes de armar el CFDI.

Comprobado ejecutando `validateRfcOrMessage("AAA010101AAA")` contra `_shared/rfcChecksum.ts`: devuelve el mensaje "no pasa la validación del dígito verificador del SAT". El mismo RFC pero con dígito correcto (`AAA010101AA1`) devuelve `null` (válido).

Analogía: los tests entregan una tarjeta con un número de credencial mal escrito; el guardia la rechaza en la puerta y nunca llegamos a probar lo que pasa adentro.

Nota: la regla de negocio está bien y no se toca. El dato de prueba es el que está mal.

## Cambio propuesto

Un solo archivo: `supabase/functions/stamp-cfdi/handler_test.ts`.

- Reemplazar las 7 ocurrencias de `receptor_rfc: "AAA010101AAA"` por un RFC con dígito verificador válido (`AAA010101AA1`), preferentemente vía una constante local `RECEPTOR_RFC` al inicio del archivo para que no vuelva a divergir.
- No se cambia ninguna aserción de estatus ni la lógica del handler.

Con eso los 6 tests vuelven a ejercer su escenario real: 200 en happy path, 502 en error de Facturapi y varianza, 504 en timeout, y 400 por falta de régimen/CP fiscal (que ahora sí fallará por el motivo correcto, no por el RFC).

## Fuera de alcance

- No se toca `validate-customers-tax-info/handler_test.ts` ni `validate-supplier-rep/index_test.ts`, aunque usan el mismo RFC: esos tests pasan hoy y no dependen del checksum.
- No se modifica `handler.ts`, ni reglas fiscales, RLS, RPCs ni permisos.

## Verificación

- `cd supabase/functions && deno test --allow-env stamp-cfdi/handler_test.ts` (esperado: 16 ok).
- Suite Deno rápida completa y `deno fmt --check` sobre el archivo tocado.

## Changelog

Entrada `patch` (7.413.x): corrección de dato de prueba con RFC inválido en la suite de timbrado; sin cambios de lógica ni de comportamiento en producción.
