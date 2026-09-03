# Correo de invitación al portal con branding LiftGo

## Contexto

Hoy la invitación al portal de clientes llega como un correo genérico de "Password Recovery" en inglés, remitente `no-reply@auth.lovable.cloud`, sin logo ni contexto. La función `invite-customer` usa `resetPasswordForEmail`, que envía la plantilla de recuperación por defecto de la plataforma — no personalizable sin dominio de correo propio.

## Restricción clave

No hay dominio de correo configurado en el proyecto. Para personalizar remitente y plantilla se requiere un dominio propio del usuario (p. ej. `lopezbenavides.com`). Si el usuario no tiene uno, se le orienta a comprarlo; no se puede personalizar con el remitente por defecto de Lovable.

## Plan

1. **Configurar dominio de correo** — el usuario completa el diálogo de configuración de dominio de email (botón en la aprobación del plan). No requiere DNS verificado para continuar; los correos se activan al verificar.

2. **Generar plantillas de correo de autenticación** — se crean las 6 plantillas (signup, magic-link, recovery, invite, email-change, reauthentication) y el hook de correo.

3. **Personalizar la plantilla de recuperación** (la que usa la invitación al portal) con branding LiftGo:
   - Logo de LiftGo al encabezado (desde `public/` o `src/assets/`, subido a storage).
   - Colores del tema: primario `#3B82F6`, fondo blanco del cuerpo, radio y tipografía del ERP.
   - Copy en español mexicano con contexto real: "Te invitaron al portal de clientes de Lift-GO", explicación de qué puede hacer (ver rentas, facturas, estado de cuenta), botón "Crear mi contraseña y entrar".
   - Aplicar el mismo branding al resto de plantillas para consistencia.

4. **Desplegar** la función `auth-email-hook` y verificar.

5. **Changelog** — nueva entrada (minor) al inicio del array, versión siguiente a v7.420.5, y actualización del MD de changelog.

## Lo que NO cambia

- Ninguna regla de negocio, RLS, guards, RPC ni lógica de `invite-customer`.
- El flujo sigue siendo `resetPasswordForEmail` → correo → el cliente crea su contraseña.
- Mientras el DNS se verifica, los correos siguen saliendo con la plantilla por defecto (nada se rompe).

## Resultado esperado

Hector y futuros clientes invitados reciben un correo con logo y colores de Lift-GO, en español, explicando que se les dio acceso al portal de clientes y qué encontrarán ahí, con botón claro para activar su cuenta.
