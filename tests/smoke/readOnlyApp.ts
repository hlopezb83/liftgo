import type { APIResponse, BrowserContext, Route } from "@playwright/test";
import { normalizeUrl } from "./consoleNoise";
import { expectedHostingScriptAbort } from "./hostingScriptNoise";
import { allowReadOnlyRequest, responseProblem } from "./readOnlyPolicy";

// Do not include Playwright messages/stacks: they can contain URLs, headers or
// credentials. Retain only an allowlisted failure category for diagnosis.
function failureKind(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/already handled/i.test(message)) return "route already handled";
  if (/closed|disposed/i.test(message)) return "target closed";
  if (/timeout|timed out/i.test(message)) return "timeout";
  if (/net::|ECONN|ENOTFOUND|connection/i.test(message)) return "network failure";
  return "operation failed";
}

/** Installed on the context before navigation, including popups and workers. */
export async function guardReadOnlyApp(context: BrowserContext, origin: string) {
  const blocked = new Set<string>();
  const blockedHostingScripts = new Set<string>();
  const problems: string[] = [];
  const assets = new Set<string>();
  await context.routeWebSocket("**/*", (socket) => {
    problems.push("Unexpected WebSocket attempt; blocked before connecting");
    socket.close();
  });
  const pending = new Set<Promise<void>>();
  const handleRoute = async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const smokeRequest = { url, method: request.method(), resourceType: request.resourceType() };
    // A terminal attempt is never retried, even if Playwright rejects it during
    // teardown: a rejection does not imply that the route is still unhandled.
    const finalize = async (action: "abort" | "fulfill", response?: APIResponse) => {
      try {
        if (action === "abort") await route.abort();
        else await route.fulfill({ response });
        return true;
      } catch (error) {
        problems.push(`Could not ${action} read-only route: ${failureKind(error)}`);
        return false;
      }
    };
    const allowed = allowReadOnlyRequest(smokeRequest, origin);
    if (!allowed) {
      blocked.add(normalizeUrl(url));
      const hostingScript = expectedHostingScriptAbort(smokeRequest, origin);
      // These exact hosting scripts stay offline, like external telemetry.
      // Every other same-origin request remains a regression, even if this
      // URL was previously blocked as an expected GET script in this run.
      if (hostingScript) blockedHostingScripts.add(hostingScript);
      else if (new URL(url).origin === origin) problems.push(`Blocked ${request.method()} ${new URL(url).pathname}`);
      await finalize("abort");
      return;
    }
    let response: APIResponse;
    try {
      // route.continue() may follow redirects without invoking routing again.
      // Fetch exactly one allowed read, then serve its untouched response.
      response = await route.fetch({ maxRedirects: 0, timeout: 15_000 });
    } catch (error) {
      problems.push(`Could not read ${new URL(url).pathname}: ${failureKind(error)}`);
      await finalize("abort");
      return;
    }
    const problem = responseProblem(url, response.status(), response.headers()["content-type"] ?? "");
    if (problem) {
      problems.push(problem);
      await finalize("abort");
      return;
    }
    if (await finalize("fulfill", response)) {
      if (/\.(?:m?js|css)$/.test(new URL(url).pathname)) assets.add(new URL(url).pathname);
    }
  };
  await context.route("**/*", (route) => {
    const operation = handleRoute(route);
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  });
  const closeAndDrain = async () => {
    // Stop all producers before draining. Never remove guards from a live
    // context: doing so would briefly permit external reads or writes.
    try {
      await context.close();
    } finally {
      await Promise.all([...pending]);
    }
  };
  return { blocked, blockedHostingScripts, problems, assets, closeAndDrain };
}
