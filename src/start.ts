import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "./lib/authAttacher";
import { renderErrorPage } from "./lib/error-page";
import { captureServerError } from "./lib/observability/serverSentry.server";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    captureServerError(error);
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const functionErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    captureServerError(error);
    throw error;
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
  // TS-01: adjunta el Bearer de la sesión a todas las server functions.
  functionMiddleware: [attachSupabaseAuth, functionErrorMiddleware],
}));
