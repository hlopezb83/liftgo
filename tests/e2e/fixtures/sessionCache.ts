import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Publica un JSON completo; ningún lector puede ver una escritura a medias. */
export function writeSessionCache(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporaryPath, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, contents, "utf8");
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
