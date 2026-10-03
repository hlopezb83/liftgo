import { z } from "zod";
import { platformAccessSchema, platformCapabilitySchema, type PlatformCapability } from "./platformAccess.types";

const rpcCapabilitiesSchema = z.array(z.string().min(1).max(100)
  .regex(/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/));
const knownCapabilities = new Set<string>(platformCapabilitySchema.options);

/** Only the verified RPC response: unknown capabilities never become UI permissions. */
export function parsePlatformAccessResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return platformAccessSchema.safeParse(value);
  }
  const response = value as Record<string, unknown>;
  const capabilities = rpcCapabilitiesSchema.safeParse(response.capabilities);
  // A non-operator with any capabilities remains invalid, including unknown ones.
  if (response.isOperator !== true || !capabilities.success) {
    return platformAccessSchema.safeParse(value);
  }
  return platformAccessSchema.safeParse({
    ...response,
    capabilities: capabilities.data.filter((capability): capability is PlatformCapability =>
      knownCapabilities.has(capability)),
  });
}
