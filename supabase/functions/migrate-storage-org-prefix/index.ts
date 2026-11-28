import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { handleStorageMigration as handle } from "./handler.ts";

export { handle as handleStorageMigration };

Deno.serve(wrapEdgeFunction("migrate-storage-org-prefix", handle));
