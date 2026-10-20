import { expect, type Page, type TestInfo } from "@playwright/test";
import { test, fitsViewport, noHorizontalOverflow } from "./mobileTest";

test.use({ authenticated: false });

async function openAccess(page: Page, path: string) {
  await page.goto(path);
  const email = page.locator("#auth-email");
  const password = page.locator("#auth-password");
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute("type", "email");
  await email.fill("qa-movil@example.invalid");
  await expect(email).toHaveValue("qa-movil@example.invalid");
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("clave-ficticia-sin-enviar");
  await expect(password).toHaveValue("clave-ficticia-sin-enviar");
  await expect(password).toHaveAttribute("type", "password");
  await fitsViewport(page, email);
  await fitsViewport(page, password);
  await fitsViewport(
    page,
    page.getByRole("button", { name: "Iniciar Sesión", exact: true }),
  );
  await noHorizontalOverflow(page);
  return password;
}

async function verifyRecoveryAndReload(page: Page, info: TestInfo) {
  await page
    .getByRole("button", { name: "¿Olvidaste tu contraseña?", exact: true })
    .click();
  const password = page.locator("#auth-password");
  await expect(password).toHaveCount(0);
  const email = page.locator("#auth-email");
  await expect(email).toHaveValue("qa-movil@example.invalid");
  await fitsViewport(page, email);
  await fitsViewport(
    page,
    page.getByRole("button", { name: /^Enviar enlace$/i }),
  );
  const back = page.getByRole("button", { name: /Volver a iniciar sesión/i });
  await fitsViewport(page, back);
  await noHorizontalOverflow(page);
  // Do not submit credentials or recovery. The fixture rejects those requests.
  await back.click();
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("clave-ficticia-de-regreso");
  await expect(password).toHaveValue("clave-ficticia-de-regreso");
  await expect(password).toHaveAttribute("type", "password");
  await page.reload();
  await expect(password).toHaveValue("");
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("segunda-hidratación-ficticia");
  await expect(password).toHaveValue("segunda-hidratación-ficticia");
  await expect(password).toHaveAttribute("type", "password");
  await fitsViewport(page, email);
  await fitsViewport(page, password);
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath("access-mobile.png"),
    fullPage: true,
  });
}

test("acceso empleados: mostrar/ocultar, recuperación sin envío y recarga", async ({
  page,
}, info) => {
  const password = await openAccess(page, "/");
  await page
    .getByRole("button", { name: "Mostrar contraseña", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("clave-ficticia-sin-enviar");
  await page
    .getByRole("button", { name: "Ocultar contraseña", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await verifyRecoveryAndReload(page, info);
});

// PortalLogin currently has no password visibility toggle. Its contract is
// a masked editable password plus recovery/back/reload, not AuthForm parity.
test("portal clientes: contraseña oculta, recuperación sin envío y recarga", async ({
  page,
}, info) => {
  await openAccess(page, "/portal/login");
  await expect(
    page.getByText("Portal de clientes", { exact: true }),
  ).toBeVisible();
  await verifyRecoveryAndReload(page, info);
});
