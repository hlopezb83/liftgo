export interface StorageListItem {
  id?: string | null;
  name?: unknown;
}

export interface StorageListPartition {
  folders: string[];
  objectPaths: string[];
}

function appendPath(prefix: string, name: unknown): string | null {
  if (typeof name !== "string") return null;
  const segment = name.trim();
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    return null;
  }
  return prefix ? `${prefix}/${segment}` : segment;
}

/**
 * Separa objetos y carpetas de una página de Storage sin exponer las rutas al
 * consumidor. Sólo acepta nombres de segmento para impedir recorridos de ruta.
 */
export function partitionStorageList(
  prefix: string,
  rows: StorageListItem[],
): StorageListPartition {
  const folders: string[] = [];
  const objectPaths: string[] = [];

  for (const row of rows) {
    const path = appendPath(prefix, row.name);
    if (!path) continue;
    if (row.id === null) {
      folders.push(path);
    } else if (typeof row.id === "string" && row.id) {
      objectPaths.push(path);
    }
  }

  return { folders, objectPaths };
}

export interface StorageInventoryBucket {
  bucket: string;
  objects: number;
  referenced_objects: number;
  unreferenced_objects: number;
}

export function summarizeStorageInventory(
  bucket: string,
  objectPaths: Iterable<string>,
  referencedPaths: Iterable<string>,
): StorageInventoryBucket {
  const objects = new Set(objectPaths);
  const referenced = new Set(referencedPaths);
  let referencedObjects = 0;

  for (const objectPath of objects) {
    if (referenced.has(objectPath)) referencedObjects++;
  }

  return {
    bucket,
    objects: objects.size,
    referenced_objects: referencedObjects,
    unreferenced_objects: objects.size - referencedObjects,
  };
}
