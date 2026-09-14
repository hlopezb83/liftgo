const UUID_V4_OR_COMPAT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcResult = {
  data: string | null;
  error: { message?: string } | null;
};

type OrganizationRpcClient = {
  rpc: (fn: "current_organization_id") => PromiseLike<RpcResult>;
};

/** Construye una ruta Storage que no puede escapar del prefijo de organización. */
export function organizationStoragePath(
  organizationId: string,
  relativePath: string,
): string {
  const organization = organizationId.trim().toLowerCase();
  const path = relativePath.trim().replace(/^\/+/, "");

  if (!UUID_V4_OR_COMPAT.test(organization)) {
    throw new Error("La organización activa no tiene un identificador válido.");
  }
  if (!path || path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("La ruta de Storage debe ser relativa y no puede contener . ni ..");
  }

  return `${organization}/${path}`;
}

/** Resuelve la organización de la sesión antes de escribir en Storage. */
export async function organizationStoragePathForSession(
  client: OrganizationRpcClient,
  relativePath: string,
): Promise<string> {
  const { data: organizationId, error } = await client.rpc(
    "current_organization_id",
  );

  if (error || !organizationId) {
    throw new Error(
      error?.message ??
        "No se pudo resolver la organización activa para guardar el archivo.",
    );
  }

  return organizationStoragePath(organizationId, relativePath);
}
