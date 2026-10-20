import { expect } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";

test.use({ authenticated: false });

for (const path of ["/", "/portal/login"]) {
  test(`acceso ${path}: contraseña, recuperación sin envío y recarga`, async ({
    page,
  }, info) => {
    await page.goto(path);
    const password = page.locator("#auth-password");
    await expect(password).toBeVisible();
    await fitsViewport(page, password);
    await password.fill("clave-ficticia-sin-enviar");
    await page
      .getByRole("button", { name: "Mostrar contraseña", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Ocultar contraseña", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: "¿Olvidaste tu contraseña?", exact: true })
      .click();
    await expect(password).toHaveCount(0);
    const back = page.getByRole("button", { name: /Volver a iniciar sesión/i });
    await fitsViewport(page, back);
    await noHorizontalOverflow(page);
    await back.click();
    await expect(password).toBeVisible();
    await page.reload();
    await password.fill("segunda-hidratación-ficticia");
    await expect(password).toHaveValue("segunda-hidratación-ficticia");
    await fitsViewport(page, password);
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: info.outputPath("access-mobile.png"),
      fullPage: true,
    });
  });
}
