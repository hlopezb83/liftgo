# Arreglo: "Invitar al Portal" falla con error genérico

## Qué está pasando

En la ficha del cliente INDIMEX TRADING, el botón "Invitar al Portal" falla con el mensaje
"Edge Function returned a non-2xx status code".

Causa confirmada:

- Tu usuario tiene el rol `administrativo`, y ese rol sí tiene acceso "full" al módulo Clientes,
  por eso la UI muestra el botón.
- La función de invitación exige estrictamente el rol `admin`, así que responde 403
  ("Forbidden: insufficient role").
- El hook de invitación no lee el cuerpo de la respuesta, así que en pantalla solo aparece el
  mensaje genérico del SDK en vez del motivo real.

Analogía: la puerta de la oficina tiene tu credencial en la lista, pero el guardia de adentro
tiene una lista más corta y te rechaza sin decirte por qué.

## Qué se va a hacer

1. Permitir que el rol `administrativo` también pueda invitar clientes al portal, alineando el
   backend con la matriz de permisos que ya usa la UI (Clientes = full).
2. Hacer que los errores de esta función muestren el motivo real (por ejemplo "El cliente ya
   tiene acceso al portal") en lugar del texto genérico.

No se toca ninguna otra regla de negocio, RLS, validación fiscal ni el resto de permisos.
`admin` sigue teniendo los mismos privilegios; solo se suma `administrativo` a esta acción concreta.

## Detalles técnicos

- `supabase/functions/invite-customer/index.ts`: cambiar `requireAdmin(req)` por
  `requireRole(req, ["admin", "administrativo"])`. Se conservan el rate limit, la validación de
  UUID/email, el guard de cliente archivado, el guard de "ya tiene portal" y la compensación
  (borrado del usuario auth si falla el aprovisionamiento).
- `src/features/customers/hooks/customers/useInviteCustomer.ts`: usar el helper existente
  `invokeEdgeFunction` (`src/lib/supabase/invokeEdgeFunction.ts`), que ya extrae el campo `error`
  del cuerpo JSON de respuestas no-2xx.
- Traducir al español los mensajes que hoy devuelve la función en inglés
  ("Customer already has portal access", "Forbidden: insufficient role") en la capa de UI del hook,
  sin cambiar los códigos HTTP.
- Actualizar `CHANGELOG.md`, `public/changelog.json`, `public/changelog-recent.json` y
  `public/version.json` con una versión patch (v7.420.4).

## Verificación

- Desplegar la función y confirmar con el usuario `administrativo` que la invitación al portal de
  INDIMEX TRADING se completa.
- Confirmar que un segundo intento (cliente ya con portal) muestra un mensaje claro y no el error
  genérico.
- Ejecutar los tests existentes y el build.
