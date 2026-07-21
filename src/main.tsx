import "./lib/observability/sentry"; // debe cargarse antes que cualquier feature
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./layouts/ErrorBoundary";
import "./lib/forms/zodConfig";
import "./index.css";

// Shim: react-day-picker v10 llama `new Intl.Locale(defaultLocale.code)` al
// cargar su chunk (getDefaultLocale → isRTL). El `code` bundleado no es un
// BCP-47 válido en Chromium estricto y lanza `RangeError: Incorrect locale
// information provided` en cada page load, aunque nuestro Calendar override
// pasa `es-MX`. Envolvemos el constructor para fallback silencioso a `en`.
const OrigLocale = Intl.Locale;
const LocaleShim = new Proxy(OrigLocale, {
  construct(target, args: ConstructorParameters<typeof Intl.Locale>) {
    try {
      return new target(...args);
    } catch {
      return new target("en");
    }
  },
}) as typeof Intl.Locale;
(Intl as { Locale: typeof Intl.Locale }).Locale = LocaleShim;

const RELOAD_KEY = "vite-preload-reload";

function isStaleChunkError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

function reloadOnce(): void {
  if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnce();
});

window.addEventListener("error", (event) => {
  if (isStaleChunkError(event.message)) reloadOnce();
});

window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  if (isStaleChunkError(message)) reloadOnce();
});

window.addEventListener("load", () => {
  sessionStorage.removeItem(RELOAD_KEY);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
