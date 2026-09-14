import { organizationStoragePath } from "./storagePath.ts";

export type StorageReferenceFormat =
  | "storage_path"
  | "bucket_path"
  | "public_url";

export type StorageMigrationDisposition =
  | "candidate"
  | "already_scoped"
  | "belongs_to_other_organization"
  | "unsupported";

export interface ParsedStorageReference {
  sourcePath: string;
  format: StorageReferenceFormat;
  publicUrlOrigin: string | null;
}

export interface StorageMigrationPlan {
  disposition: StorageMigrationDisposition;
  sourcePath: string | null;
  destinationPath: string | null;
  format: StorageReferenceFormat | null;
  publicUrlOrigin: string | null;
}

const UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;

function normalizePath(value: string): string | null {
  const path = value.trim().replace(/^\/+/, "");
  if (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    return null;
  }
  return path;
}

function decodePath(path: string): string | null {
  try {
    return normalizePath(
      path.split("/").map((part) => decodeURIComponent(part)).join("/"),
    );
  } catch {
    return null;
  }
}

/**
 * Extrae únicamente rutas publicas canonicas de Supabase. URLs firmadas, hosts
 * ajenos y query strings se rechazan: no deben duplicarse ni persistirse.
 */
export function parseStorageReference(
  value: unknown,
  bucketId: string,
): ParsedStorageReference | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    const marker = `/storage/v1/object/public/${bucketId}/`;
    if (!url.pathname.startsWith(marker)) return null;
    const sourcePath = decodePath(url.pathname.slice(marker.length));
    if (!sourcePath) return null;

    return {
      sourcePath,
      format: "public_url",
      publicUrlOrigin: url.origin,
    };
  }

  const bucketPrefix = `${bucketId}/`;
  if (raw.startsWith(bucketPrefix)) {
    const sourcePath = normalizePath(raw.slice(bucketPrefix.length));
    return sourcePath
      ? { sourcePath, format: "bucket_path", publicUrlOrigin: null }
      : null;
  }

  const sourcePath = normalizePath(raw);
  return sourcePath
    ? { sourcePath, format: "storage_path", publicUrlOrigin: null }
    : null;
}

export function makeStorageMigrationPlan(
  organizationId: string,
  bucketId: string,
  value: unknown,
): StorageMigrationPlan {
  const parsed = parseStorageReference(value, bucketId);
  if (!parsed) {
    return {
      disposition: "unsupported",
      sourcePath: null,
      destinationPath: null,
      format: null,
      publicUrlOrigin: null,
    };
  }

  const organization = organizationId.trim().toLowerCase();
  if (parsed.sourcePath.startsWith(`${organization}/`)) {
    return {
      disposition: "already_scoped",
      sourcePath: parsed.sourcePath,
      destinationPath: parsed.sourcePath,
      format: parsed.format,
      publicUrlOrigin: parsed.publicUrlOrigin,
    };
  }

  if (UUID_PREFIX.test(parsed.sourcePath)) {
    return {
      disposition: "belongs_to_other_organization",
      sourcePath: parsed.sourcePath,
      destinationPath: null,
      format: parsed.format,
      publicUrlOrigin: parsed.publicUrlOrigin,
    };
  }

  try {
    return {
      disposition: "candidate",
      sourcePath: parsed.sourcePath,
      destinationPath: organizationStoragePath(organization, parsed.sourcePath),
      format: parsed.format,
      publicUrlOrigin: parsed.publicUrlOrigin,
    };
  } catch {
    return {
      disposition: "unsupported",
      sourcePath: null,
      destinationPath: null,
      format: null,
      publicUrlOrigin: null,
    };
  }
}

/** Produce el nuevo valor sin conservar la URL/ruta legada en el ledger. */
export function destinationReferenceValue(
  bucketId: string,
  destinationPath: string,
  format: StorageReferenceFormat,
  publicUrlOrigin: string | null,
): string | null {
  if (format === "storage_path") return destinationPath;
  if (format === "bucket_path") return `${bucketId}/${destinationPath}`;
  if (!publicUrlOrigin) return null;

  try {
    const url = new URL(publicUrlOrigin);
    const encodedPath = destinationPath.split("/").map(encodeURIComponent).join(
      "/",
    );
    url.pathname = `/storage/v1/object/public/${bucketId}/${encodedPath}`;
    return url.toString();
  } catch {
    return null;
  }
}
