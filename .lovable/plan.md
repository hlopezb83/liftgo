# Fix: e2e setup falla por selector ambiguo de contraseña

## Causa
En `tests/e2e/global.setup.ts:22`, `getByLabel(/contraseña|password/i)` matchea 2 elementos:
1. El `<input id="auth-password">`
2. El botón toggle `<button aria-label="Mostrar contraseña">` (ojito mostrar/ocultar)

Playwright en strict mode falla porque la regex matchea ambos accessible names.

## Cambio
Reemplazar el selector por uno no ambiguo apuntando al input por id:

```ts
// tests/e2e/global.setup.ts
await page.locator('#auth-email').fill(email);
await page.locator('#auth-password').fill(password);
```

(o equivalente: `page.getByRole('textbox', { name: 'Contraseña' })`, pero `#auth-password` es el más estable porque ya añadimos esos ids para Playwright en la fix anterior).

## Archivos
- `tests/e2e/global.setup.ts` — cambiar las 2 líneas de `getByLabel(...)` por `locator('#auth-email')` y `locator('#auth-password')`.

## Changelog
- `public/changelog.json` + `public/changelog/v6.23.2.json` (patch) — "Fix selector ambiguo de contraseña en e2e setup".

## Verificación
No puedo correr Playwright completo aquí, pero confirmo que el build pasa y que el cambio resuelve el strict-mode violation reportado en el log.
