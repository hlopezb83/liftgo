import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  withVerifiedEdgeJob,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";
import { handleRequest } from "./handler.ts";

Deno.serve(
  wrapEdgeFunction("generate-recurring-invoices", (req) =>
    handleRequest(req, {
      diagnostics: {
        identify: setVerifiedEdgeIdentity,
        capture: captureEdgeError,
        withJob: withVerifiedEdgeJob,
      },
    })),
);
