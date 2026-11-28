import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { handleRequest } from "./handler.ts";

Deno.serve(wrapEdgeFunction("generate-recurring-invoices", handleRequest));
