import { Buffer } from "node:buffer";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

/**
 * Production-entry regression: use the shipped, tree-shaken app and real auth
 * SDK. Only HTTP responses are faked. No test-only app imports, real backend,
 * real credentials, email delivery, or account mutations are involved.
 */
const BACKEND = "http://127.0.0.1:54321";
const STORAGE_KEY = "sb-127-auth-token";
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const RECOVERY_ID = "00000000-0000-4000-8000-000000000002";

function fakeSession(id: string, recovery = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: id,
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: recovery ? "00000000-0000-4000-8000-000000000012" : "00000000-0000-4000-8000-000000000011",
    amr: [{ method: recovery ? "recovery" : "password", timestamp: now }],
  })}.synthetic-test-signature`;
  return {
    access_token,
    refresh_token: `synthetic-refresh-${id}`,
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: recovery ? "recovery@example.invalid" : "administrator@example.invalid",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

type FakeSession = ReturnType<typeof fakeSession>;

async function recoveryBrowser(browser: Browser, origin: string) {
  const administrator = fakeSession(ADMIN_ID);
  const recovered = fakeSession(RECOVERY_ID, true);
  const context = await browser.newContext({
    serviceWorkers: "block",
    storageState: {
      cookies: [],
      origins: [{ origin, localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(administrator) }] }],
    },
  });
  const updates: { userId: string; password: string }[] = [];
  const logouts: string[] = [];
  const unexpectedAuth: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    // Fail closed: no external traffic, even if the bundle's backend changes.
    if (url.origin !== BACKEND) return route.abort();
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const authorization = request.headers().authorization;
    const session = [administrator, recovered].find((entry) => authorization === `Bearer ${entry.access_token}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/user") {
      if (!session) return json({ code: "bad_jwt", message: "Synthetic invalid recovery token" }, 403);
      if (request.method() === "PUT") {
        updates.push({ userId: session.user.id, password: request.postDataJSON().password });
      }
      return json(session.user);
    }
    if (url.pathname === "/auth/v1/logout") {
      logouts.push(session?.user.id ?? "unknown");
      return json({});
    }
    if (url.pathname.startsWith("/auth/")) {
      unexpectedAuth.push(`${request.method()} ${url.pathname}`);
      return json({ message: "Unconfigured synthetic auth request" }, 400);
    }
    // Empty offline application data is sufficient to render the auth flow.
    if (url.pathname.startsWith("/rest/")) {
      return json(request.headers().accept?.includes("vnd.pgrst.object") ? null : []);
    }
    return route.abort();
  });
  return { context, administrator, recovered, updates, logouts, unexpectedAuth };
}

function recoveryUrl(session: FakeSession, path: string): string {
  return `${path}#${new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: "3600",
    token_type: "bearer",
    type: "recovery",
  })}`;
}

async function storedUser(context: BrowserContext): Promise<string | undefined> {
  const state = await context.storageState();
  const value = state.origins.flatMap((entry) => entry.localStorage).find((entry) => entry.name === STORAGE_KEY)?.value;
  return value ? (JSON.parse(value) as FakeSession).user.id : undefined;
}

for (const path of ["/auth?type=recovery", "/"]) {
  test(`compiled recovery replaces prior administrator, survives reload and completes: ${path}`, async ({ browser, baseURL }) => {
    const fixture = await recoveryBrowser(browser, new URL(baseURL!).origin);
    try {
      const page = await fixture.context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      expect(await storedUser(fixture.context)).toBe(ADMIN_ID);
      await page.goto(new URL(recoveryUrl(fixture.recovered, path), baseURL).href);
      const password = page.getByLabel("Nueva contraseña", { exact: true });
      await expect(password).toBeVisible();
      await expect(page.getByRole("button", { name: "Actualizar Contraseña", exact: true })).toBeEnabled();
      await expect.poll(() => storedUser(fixture.context)).toBe(RECOVERY_ID);
      await expect.poll(() => new URL(page.url()).hash).toBe("");

      // The SDK consumes the link. Reload must not open the operational app
      // while this authenticated recovery session still needs a new password.
      await page.reload();
      await expect(password).toBeVisible();
      await password.fill("Synthetic-password-2026!");
      await page.getByRole("button", { name: "Actualizar Contraseña", exact: true }).click();
      await expect.poll(() => fixture.updates).toEqual([{ userId: RECOVERY_ID, password: "Synthetic-password-2026!" }]);
      await expect(password).toHaveCount(0);
      // A clean auth entry after completion must hydrate in ordinary sign-in
      // mode, even though the SDK token still contains its recovery AMR.
      await page.goto(new URL("/auth", baseURL).href);
      await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
      expect(fixture.logouts).toEqual([]);
      expect(fixture.unexpectedAuth).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await fixture.context.close();
    }
  });
}

for (const suffix of [
  "#error=access_denied&error_code=otp_expired&error_description=Link+expired",
  "#access_token=synthetic-invalid-token&refresh_token=synthetic-invalid-refresh&expires_in=3600&token_type=bearer&type=recovery",
]) {
  test(`compiled invalid recovery never changes prior administrator: ${suffix.includes("otp_expired") ? "expired" : "rejected token"}`, async ({ browser, baseURL }) => {
    const fixture = await recoveryBrowser(browser, new URL(baseURL!).origin);
    try {
      const page = await fixture.context.newPage();
      await page.goto(new URL(`/auth?type=recovery${suffix}`, baseURL).href);
      await expect(page.getByRole("alert").filter({ hasText: "inválido o ya expiró" })).toBeVisible({ timeout: 25_000 });
      await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Actualizar Contraseña", exact: true })).toHaveCount(0);
      expect(await storedUser(fixture.context)).toBe(ADMIN_ID);
      await page.getByRole("button", { name: "Solicitar un enlace nuevo", exact: true }).click();
      await expect(page.getByText("Restablecer Contraseña", { exact: true })).toBeVisible();
      expect(fixture.updates).toEqual([]);
      expect(fixture.logouts).toEqual([]);
      expect(fixture.unexpectedAuth).toEqual([]);
      expect(await storedUser(fixture.context)).toBe(ADMIN_ID);
    } finally {
      await fixture.context.close();
    }
  });
}
