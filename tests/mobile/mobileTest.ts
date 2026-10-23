import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  installOfflineDispatcher,
  type OfflineProfile,
} from "./offlineDispatcher";

type Fixtures = {
  authenticated: boolean;
  profile: OfflineProfile;
  mockBackend: Awaited<ReturnType<typeof installOfflineDispatcher>>;
  pageErrors: string[];
};

// The real bundle is unchanged. Only read responses are synthetic; teardown
// checks every scenario for unexpected backend calls and uncaught JS errors.
export const test = base.extend<Fixtures>({
  authenticated: [true, { option: true }],
  profile: ["dispatcher", { option: true }],
  mockBackend: [
    async ({ context, baseURL, authenticated, profile }, use) => {
      const mockBackend = await installOfflineDispatcher(
        context,
        new URL(baseURL!).origin,
        authenticated,
        profile,
      );
      await use(mockBackend);
      expect(mockBackend.unexpected, "unexpected backend requests").toEqual([]);
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

export async function fitsViewport(
  page: Page,
  element: Locator,
  vertical = false,
) {
  await expect(element).toBeVisible();
  // Wait for Radix opening transforms to settle through assertions, not sleeps.
  await expect(async () => {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    if (vertical) {
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
  }).toPass({ timeout: 10_000 });
}

export async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() =>
    [
      document.documentElement,
      document.body,
      document.querySelector("#main-content"),
    ]
      .filter((e): e is HTMLElement => e instanceof HTMLElement)
      .map((e) => ({
        tag: e.id || e.tagName,
        scroll: e.scrollWidth,
        client: e.clientWidth,
      })),
  );
  for (const width of widths)
    expect(width.scroll, JSON.stringify(width)).toBeLessThanOrEqual(
      width.client + 1,
    );
}
