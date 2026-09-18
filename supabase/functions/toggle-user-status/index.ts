// RETIRADO (tramo 11, auditoría multiempresa). Ver _shared/retiredEndpoint.ts.
// Reemplazo org-scoped: src/lib/userAdmin.functions.ts#toggleUserStatusFn
import { makeRetiredEndpointHandler } from "../_shared/retiredEndpoint.ts";

Deno.serve(makeRetiredEndpointHandler("toggle-user-status"));
