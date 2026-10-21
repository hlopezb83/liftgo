import type { BrowserContext } from "@playwright/test";
import { normalizeUrl } from "./consoleNoise";
import { allowReadOnlyRequest, responseProblem } from "./readOnlyPolicy";

/** Installed on the context before navigation, including popups and workers. */
export async function guardReadOnlyApp(context: BrowserContext, origin: string) {
  const blocked = new Set<string>();
  const problems: string[] = [];
  const assets = new Set<string>();
  await context.routeWebSocket("**/*", (socket) => {
    problems.push("Unexpected WebSocket attempt; blocked before connecting");
    socket.close();
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const allowed = allowReadOnlyRequest({ url, method: request.method(), resourceType: request.resourceType() }, origin);
    if (!allowed) {
      blocked.add(normalizeUrl(url));
      // External fonts/telemetry are intentionally offline. Any same-origin
      // API, form submission or unknown resource is a regression, not noise.
      if (new URL(url).origin === origin) problems.push(`Blocked ${request.method()} ${new URL(url).pathname}`);
      await route.abort();
      return;
    }
    try {
      // route.continue() may follow redirects without invoking routing again.
      // Fetch exactly one allowed read, then serve its untouched response.
      const response = await route.fetch({ maxRedirects: 0, timeout: 15_000 });
      const problem = responseProblem(url, response.status(), response.headers()["content-type"] ?? "");
      if (problem) {
        problems.push(problem);
        await route.abort();
        return;
      }
      if (/\.(?:m?js|css)$/.test(new URL(url).pathname)) assets.add(new URL(url).pathname);
      await route.fulfill({ response });
    } catch {
      problems.push(`Could not read ${new URL(url).pathname}`);
      await route.abort();
    }
  });
  return { blocked, problems, assets };
}
