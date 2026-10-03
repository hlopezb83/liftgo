import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleParseCsf } from "./handler.ts";
import { enforceRateLimit, requireRole } from "../_shared/auth.ts";
import { aiChatCompletion } from "../_shared/ai.ts";
import { reportEdgeRuntime } from "../_shared/runtimeAttestation.ts";
import {
  captureEdgeError,
  setVerifiedEdgeIdentity,
  wrapEdgeFunction,
} from "../_shared/edgeSentry.ts";

reportEdgeRuntime("parse-csf");
serve(wrapEdgeFunction("parse-csf", (req) =>
  handleParseCsf(req, {
    requireRole,
    enforceRateLimit,
    aiChatCompletion,
    setIdentity: setVerifiedEdgeIdentity,
    capture: captureEdgeError,
  })));
