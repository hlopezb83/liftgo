import type { BrowserContext } from "@playwright/test";

/** Keep interception active until every page is closed, including unload work. */
export async function closeOfflinePages(context: BrowserContext): Promise<string[]> {
  const drained = await Promise.allSettled(context.pages().map(page =>
    page.waitForLoadState("networkidle", { timeout: 10_000 })));
  while (context.pages().length > 0) {
    await Promise.all(context.pages().map(page => page.close({ runBeforeUnload: false })));
  }
  // There are no live pages left that could issue an unintercepted request.
  await context.unrouteAll({ behavior: "wait" });
  return drained.flatMap(result => result.status === "rejected" ? [String(result.reason)] : []);
}
