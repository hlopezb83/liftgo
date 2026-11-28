import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { handleRequest } from "./handler.ts";

export { handleRequest };

if (import.meta.main) {
  Deno.serve(wrapEdgeFunction("reconcile-stamping-invoices", handleRequest));
}
