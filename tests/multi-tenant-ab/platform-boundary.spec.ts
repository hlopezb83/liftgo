import { test, expect } from "@playwright/test";
import { applyApiSession } from "../e2e/fixtures/apiAuth";
import { readAbContext } from "./fixtures/abSeed";

test("el raíz entra a su portal de plataforma", async ({ page }) => {
  const user = readAbContext().platformOperator;
  await applyApiSession(page, user.email, user.password);
  await page.goto("/platform");
  await expect(page.getByRole("navigation", { name: "Centro de Plataforma" })).toBeVisible();
});

test("el admin de empresa no entra al portal de plataforma", async ({ page }) => {
  const user = readAbContext().A.internal;
  await applyApiSession(page, user.email, user.password);
  await page.goto("/platform");
  await expect(page.getByText("Acceso restringido", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Centro de Plataforma" })).toHaveCount(0);
});
