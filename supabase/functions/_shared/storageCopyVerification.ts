// Comparador de integridad fuente/copia para la migración de Storage.
//
// Sólo trabaja con tamaño y SHA-256 de los bytes: no recibe ni devuelve rutas,
// URLs ni valores de referencia, de modo que los códigos que salen de aquí se
// pueden persistir y agregar sin exponer datos.

export type CopyVerdict =
  | "verified"
  | "source_missing"
  | "destination_missing"
  | "copy_size_mismatch"
  | "copy_digest_mismatch";

export interface ObjectDigest {
  size: number;
  sha256: string;
}

/** SHA-256 hexadecimal de un contenido binario. */
export async function digestBytes(bytes: Uint8Array): Promise<ObjectDigest> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );
  const sha256 = Array.from(new Uint8Array(buffer))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
  return { size: bytes.byteLength, sha256 };
}

/**
 * Decide si una copia es idéntica a su fuente. Fail-closed: cualquier lado
 * ausente o ilegible es un veredicto negativo, nunca "verified".
 */
export function compareCopy(
  source: ObjectDigest | null,
  destination: ObjectDigest | null,
): CopyVerdict {
  if (!source) return "source_missing";
  if (!destination) return "destination_missing";
  if (source.size !== destination.size) return "copy_size_mismatch";
  if (source.sha256 !== destination.sha256) return "copy_digest_mismatch";
  return "verified";
}
