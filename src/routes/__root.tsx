// ported from main.tsx — Sentry debe cargarse antes que cualquier feature
import "@/lib/observability/sentry";
import "@/lib/forms/zodConfig";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { AppProviders } from "@/layouts/AppProviders";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { isStaleChunkMessage, reloadForStaleChunk } from "@/lib/staleChunkReload";
import appCss from "../styles.css?url";
import type { QueryClient } from "@tanstack/react-query";

// ported from main.tsx — Shim: react-day-picker v10 llama
// `new Intl.Locale(defaultLocale.code)` al cargar su chunk. El `code`
// bundleado no es BCP-47 válido en Chromium estricto y lanza RangeError.
// Envolvemos el constructor para fallback silencioso a `en`.
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

// ported from main.tsx — recarga controlada ante chunks stale (máx. 2 por 30s,
// la guarda vive en staleChunkReload.ts).
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });
  window.addEventListener("error", (event) => {
    if (isStaleChunkMessage(event.message)) reloadForStaleChunk();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    if (isStaleChunkMessage(message)) reloadForStaleChunk();
  });
}

const NotFoundLazy = lazy(() => import("@/features/system/pages/NotFound"));

const TITLE = "LiftGo — Gestión de Montacargas";
const DESCRIPTION = "Sistema integral de gestión de renta y mantenimiento de montacargas";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "author", content: "Lift Go" },
      // Evita que Chrome/Google Translate traduzca nombres propios de clientes,
      // equipos y folios.
      { name: "google", content: "notranslate" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: "/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@LiftGo" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS_HREF },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <ErrorBoundary>
      <AppProviders queryClient={queryClient}>
        <Outlet />
      </AppProviders>
    </ErrorBoundary>
  );
}

function RootNotFound() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NotFoundLazy />
    </Suspense>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
        <h1 className="text-lg font-medium text-foreground">Esta página no cargó</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado. Puedes reintentar o volver al inicio.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground min-h-11"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
