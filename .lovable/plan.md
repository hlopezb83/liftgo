## Diagnóstico

El fallo principal no viene de los warnings de Vite/Browserslist, sino del setup de Playwright:

```text
Error: locator.fill: Test timeout exceeded
waiting for getByLabel(/correo|email/i)
```

El test sí encuentra el heading **“Iniciar Sesión”**, pero no encuentra el input por label. En `src/features/auth/components/AuthForm.tsx`, los campos usan `<Label>` sin `htmlFor` y los `<Input>` no tienen `id`, por lo que Playwright no puede asociar “Correo Electrónico” ni “Contraseña” con sus inputs usando `getByLabel()`.

## Plan de implementación

1. Actualizar `AuthForm.tsx` para que los campos sean accesibles y compatibles con Playwright:
   - Agregar `id="auth-email"` al input de correo.
   - Agregar `htmlFor="auth-email"` al label de correo.
   - Agregar `id="auth-password"` al input de contraseña.
   - Agregar `htmlFor="auth-password"` al label de contraseña.
   - Mantener los textos actuales en español mexicano.

2. Mantener el test e2e sin cambios, porque `getByLabel(/correo|email/i)` es el selector correcto desde accesibilidad.

3. Actualizar changelog como exige el proyecto:
   - Agregar `6.22.12` al inicio de `public/changelog.json`.
   - Crear `public/changelog/v6.22.12.json` con el detalle del fix.

## Validación esperada

Después del cambio, el setup de e2e deberá poder ejecutar:

```ts
page.getByLabel(/correo|email/i).fill(email)
page.getByLabel(/contraseña|password/i).fill(password)
```

sin quedarse esperando el locator.