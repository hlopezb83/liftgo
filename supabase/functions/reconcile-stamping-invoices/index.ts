import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  withVerifiedEdgeJob,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { handleRequest } from "./handler.ts";

export { handleRequest };

if (import.meta.main) {
  Deno.serve(
    wrapEdgeFunction("reconcile-stamping-invoices", (req) =>
      handleRequest(req, {
        diagnostics: {
          identify: setVerifiedEdgeIdentity,
          capture: captureEdgeError,
          withJob: withVerifiedEdgeJob,
        },
      })),
  );
}
